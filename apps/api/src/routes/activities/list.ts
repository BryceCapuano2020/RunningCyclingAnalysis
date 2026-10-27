import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_CHARS,
  MAX_PAGE_DIGEST_BYTES,
  MAX_PAGE_SIZE,
} from '@rca/contract'
import type { AppEnv, Db } from '../../env.ts'
import { invalidRequest } from '../../http.ts'
import { decodeCursor, encodeCursor, type Cursor } from '../../cursor.ts'
import { chargeDaily } from '../../budget.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../../middleware.ts'
import { activities } from '../../db/schema.ts'
import { pageBody, spliceRecord } from './body.ts'
import { toEnvelope } from './shared.ts'

/**
 * Database pages one listing request may scan. Unreadable rows fill no page, so without this cap a
 * long run of them would take an unbounded number of D1 queries in one request.
 */
const MAX_SCAN_PAGES = 8

const listQuery = z.object({
  /** Epoch ms. Returns records created at or after this time. */
  since: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  /** Opaque, from a previous page's nextCursor. */
  cursor: z.string().max(MAX_CURSOR_CHARS).optional(),
})

/** A row's position and digest size: enough to choose a page before any digest JSON is read. */
interface Candidate {
  id: string
  createdAt: number
  digestBytes: number
}

/** The page a scan is building, and where the listing stands when the scan stops. */
interface PageScan {
  /** The records in page order, each already serialised (see `spliceRecord`). */
  items: string[]
  /** Digest JSON bytes held by `items`, kept within MAX_PAGE_DIGEST_BYTES. */
  digestBytes: number
  unreadable: number
  /** The last row examined, readable or not, so a page of skipped rows still moves the cursor on. */
  examinedTo: Cursor | undefined
  hasMore: boolean
}

/**
 * Spends the cursor the server issued last. It is accepted once: the update clears it in the same
 * statement that matches it, so a replayed or forged cursor finds nothing to spend.
 */
async function spendListCursor(db: D1Database, userId: string, cursor: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE users SET list_cursor = NULL WHERE id = ? AND list_cursor = ?')
    .bind(userId, cursor)
    .run()
  return result.meta.changes === 1
}

/** The last cursor the server issued is free to continue; any other read takes a daily unit. */
async function spendCursorOrCharge(
  c: Context<AppEnv>,
  userId: string,
  cursor: string | undefined,
): Promise<void> {
  const continuing = cursor !== undefined && (await spendListCursor(c.env.DB, userId, cursor))
  if (!continuing) await chargeDaily(c.env.DB, userId, 'read', c.var.deps.now())
}

/** Logs a skipped row by id, never by content. */
function logUnreadable(activityId: string): void {
  console.warn(JSON.stringify({ event: 'activity_digest_unreadable', activityId }))
}

/** The next metadata-only page of rows strictly older than `after`, newest first. */
async function listCandidates(
  db: Db,
  filters: (SQL | undefined)[],
  after: Cursor | undefined,
  size: number,
): Promise<Candidate[]> {
  const pageFilters = [...filters]
  if (after !== undefined) {
    pageFilters.push(
      or(
        lt(activities.createdAt, after.createdAt),
        and(eq(activities.createdAt, after.createdAt), lt(activities.id, after.id)),
      ),
    )
  }
  return db
    .select({
      id: activities.id,
      createdAt: activities.createdAt,
      digestBytes: sql<number>`length(CAST(${activities.digestJson} AS BLOB))`,
    })
    .from(activities)
    .where(and(...pageFilters))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(size)
}

/** The leading candidates that fit the page's row count and its digest byte budget. */
function fitPage(candidates: Candidate[], page: PageScan, limit: number): Candidate[] {
  const selected: Candidate[] = []
  let selectedBytes = page.digestBytes
  for (const candidate of candidates) {
    if (page.items.length + selected.length >= limit) break
    if (selectedBytes + candidate.digestBytes > MAX_PAGE_DIGEST_BYTES) break
    selected.push(candidate)
    selectedBytes += candidate.digestBytes
  }
  return selected
}

/**
 * Adds the selected rows to the page: deleted rows are skipped, and rows that cannot be sent (a
 * digest that is not JSON, an envelope past the contract's limits) are counted. A digest that is
 * JSON goes out as stored, because the client checks its shape (listActivities in the web client),
 * so the server never validates or re-serialises one.
 */
async function readSelected(
  db: Db,
  userId: string,
  selected: Candidate[],
  page: PageScan,
): Promise<void> {
  const fetched = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        inArray(
          activities.id,
          selected.map((r) => r.id),
        ),
      ),
    )
    .all()
  const rowsById = new Map(fetched.map((row) => [row.id, row]))
  for (const candidate of selected) {
    const row = rowsById.get(candidate.id)
    if (row === undefined) continue
    const record = spliceRecord(toEnvelope(row), row.digestJson)
    if (record === undefined) {
      logUnreadable(row.id)
      page.unreadable += 1
      continue
    }
    page.items.push(record)
    page.digestBytes += candidate.digestBytes
  }
}

/** Scans until the page is full, the listing ends, or the scan budget is spent. */
async function scanPage(
  db: Db,
  userId: string,
  filters: (SQL | undefined)[],
  resumeAfter: Cursor | undefined,
  limit: number,
): Promise<PageScan> {
  const candidatePageSize = limit + 1
  const page: PageScan = {
    items: [],
    digestBytes: 0,
    unreadable: 0,
    examinedTo: undefined,
    hasMore: false,
  }
  let scanAfter = resumeAfter
  // Digest JSON is capped at 256 KiB per activity. Scan only small metadata first, then fetch
  // the rows that fit the page byte budget; a large library cannot create a huge JSON response.
  for (let scans = 0; page.items.length < limit; scans += 1) {
    if (scans === MAX_SCAN_PAGES) {
      // The rows examined so far are behind the cursor, so the next request resumes after them.
      page.hasMore = true
      break
    }
    const candidates = await listCandidates(db, filters, scanAfter, candidatePageSize)
    if (candidates.length === 0) break
    const selected = fitPage(candidates, page, limit)
    if (selected.length === 0) {
      // The first candidate does not fit this page's byte budget, so the next request starts there.
      page.hasMore = true
      break
    }
    await readSelected(db, userId, selected, page)

    const lastExamined = selected.at(-1)
    if (!lastExamined) break
    scanAfter = { createdAt: lastExamined.createdAt, id: lastExamined.id }
    page.examinedTo = scanAfter
    if (page.items.length >= limit) {
      page.hasMore = selected.length < candidates.length || candidates.length === candidatePageSize
      break
    }
    if (selected.length < candidates.length) {
      // Some selected rows may have disappeared between the metadata and fetch queries. Try
      // the unscanned row again if deleted rows left enough room in this response.
      if (page.digestBytes >= MAX_PAGE_DIGEST_BYTES) {
        page.hasMore = true
        break
      }
      continue
    }
    if (candidates.length < candidatePageSize) break
  }
  return page
}

/** Saves the next page's cursor, if there is one, and returns the page body as JSON text. */
async function buildListing(db: D1Database, userId: string, page: PageScan): Promise<string> {
  const nextCursor = page.hasMore && page.examinedTo ? encodeCursor(page.examinedTo) : null
  if (nextCursor !== null) {
    await db.prepare('UPDATE users SET list_cursor = ? WHERE id = ?').bind(nextCursor, userId).run()
  }
  return pageBody(page.items, {
    nextCursor,
    ...(page.unreadable > 0 ? { unreadable: page.unreadable } : {}),
  })
}

export const listRoutes = new Hono<AppEnv>()

listRoutes.get(
  '/',
  sameOriginReadGuard,
  requireUser,
  zValidator('query', listQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { db } = c.var
    const query = c.req.valid('query')
    const userId = currentUser(c).id
    // A malformed cursor is refused before any read unit is taken.
    const resumeAfter = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    await spendCursorOrCharge(c, userId, query.cursor)
    const filters: (SQL | undefined)[] = [eq(activities.userId, userId)]
    if (query.since !== undefined) filters.push(gte(activities.createdAt, query.since))
    const page = await scanPage(db, userId, filters, resumeAfter, query.limit ?? DEFAULT_PAGE_SIZE)
    return c.body(await buildListing(c.env.DB, userId, page), 200, {
      'content-type': 'application/json',
    })
  },
)
