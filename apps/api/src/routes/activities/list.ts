import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'
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
 * Pays for one page. A request without a cursor starts a library load and takes one `read` unit, so
 * a load costs one unit however many tabs or devices make it. Every page, first or later, is
 * charged its size, but never less than a default page, against the day's `listRows`. So a replayed
 * cursor cannot read for free, and asking for one row at a time cannot make a request cheap: the
 * work and the rows written per request are about the same whatever the page size. A page cut short
 * by the digest byte budget is charged in full too. Nothing is remembered between requests: a
 * cursor is only a position in the caller's own list.
 */
async function chargePage(
  c: Context<AppEnv>,
  userId: string,
  cursor: string | undefined,
  limit: number,
): Promise<void> {
  const now = c.var.deps.now()
  const load = cursor === undefined ? await chargeDaily(c.env.DB, userId, 'read', now) : undefined
  try {
    await chargeDaily(c.env.DB, userId, 'listRows', now, Math.max(limit, DEFAULT_PAGE_SIZE))
  } catch (error) {
    await load?.refund()
    throw error
  }
}

/** Logs a skipped row by id, never by content. */
function logUnreadable(activityId: string): void {
  console.warn(JSON.stringify({ event: 'activity_digest_unreadable', activityId }))
}

/**
 * The next metadata-only page of rows strictly older than `after`, newest first. The row-value
 * comparison and the order both follow activities_user_created_id_idx (user_id, created_at, id), so
 * the page is one index range: no sort, and no dependence on table statistics.
 */
async function listCandidates(
  db: Db,
  filters: (SQL | undefined)[],
  after: Cursor | undefined,
  size: number,
): Promise<Candidate[]> {
  const pageFilters = [...filters]
  if (after !== undefined) {
    pageFilters.push(
      sql`(${activities.createdAt}, ${activities.id}) < (${after.createdAt}, ${after.id})`,
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
  // The unary plus keeps the planner off the user_id index, which with no table statistics it
  // prefers and then scans the whole library once per page. The ids come from the primary key; the
  // user_id test still applies to every row, so the read stays scoped to this user.
  const fetched = await db
    .select()
    .from(activities)
    .where(
      and(
        inArray(
          activities.id,
          selected.map((r) => r.id),
        ),
        sql`+${activities.userId} = ${userId}`,
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

/** The page body as JSON text, with the next page's cursor when there is one. */
function buildListing(page: PageScan): string {
  const nextCursor = page.hasMore && page.examinedTo ? encodeCursor(page.examinedTo) : null
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
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    // A malformed cursor is refused before any unit is taken.
    const resumeAfter = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    await chargePage(c, userId, query.cursor, limit)
    const filters: (SQL | undefined)[] = [eq(activities.userId, userId)]
    if (query.since !== undefined) filters.push(gte(activities.createdAt, query.since))
    const page = await scanPage(db, userId, filters, resumeAfter, limit)
    return c.body(buildListing(page), 200, {
      'content-type': 'application/json',
    })
  },
)
