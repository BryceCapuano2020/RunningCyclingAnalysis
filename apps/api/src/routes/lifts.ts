import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { z } from 'zod'
import { LIFT_PAGE_SIZE, LiftDeleteSchema, LiftWriteSchema } from '@rca/contract'
import type { LiftDeleteAnswer, LiftPageAnswer, LiftWriteAnswer } from '@rca/contract'
import {
  MAX_LIFT_SETS_PER_USER,
  decodeLiftCursor,
  encodeLiftCursor,
  liftSetKey,
  parseLiftSetKey,
} from '@rca/core/lift'
import type { LiftSetIdentity } from '@rca/core/lift'
import type { AppEnv } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { HttpError } from '../errors.ts'
import { limitBody, validationMessage } from '../http.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../middleware.ts'
import {
  COUNT_GONE_KEYS,
  COUNT_NEW_KEYS,
  DELETE_SETS,
  INSERT_NEW_SETS,
  PAGE_AFTER,
  PAGE_FIRST,
  UPSERT_SETS,
  identitiesJson,
  setsJson,
  toLiftSet,
} from './liftSql.ts'
import type { LiftRow } from './liftSql.ts'

/** 500 sets of about 250 bytes, and 500 keys of about 80, each with room to spare. */
const WRITE_BODY_BYTES = 256 * 1024
const DELETE_BODY_BYTES = 64 * 1024
const CURSOR_CHARS = 256
/** Refused sets whose reason the message gives; `refused` carries every index. */
const REASONS_SHOWN = 3
/** What a refused lift page says: the rows meter is shared with the activity list. */
const LIFT_ROWS_LIMIT_MESSAGE =
  "You have read as many rows as today's allowance covers. Try again after midnight UTC"

interface Counters {
  lift_count: number
  lift_revision: number
}

/**
 * A 400 that names every refused set by its index in `refused` (sorted, once each), so the browser drops
 * only those. The message is a short summary with the first few reasons.
 */
function refusal(error: z.core.$ZodError) {
  const reasons = new Map<number, string>()
  for (const issue of error.issues) {
    const at = issue.path[1]
    if (typeof at === 'number' && !reasons.has(at)) reasons.set(at, issue.message.slice(0, 60))
  }
  const refused = [...reasons.keys()].sort((a, b) => a - b)
  const where = String(error.issues[0]?.path[0] ?? 'body')
  const shown = refused.slice(0, REASONS_SHOWN).map((i) => `${where}.${i}: ${reasons.get(i)}`)
  const more = refused.length - shown.length
  const message =
    refused.length === 0
      ? validationMessage(error)
      : [...shown, ...(more > 0 ? [`and ${more} more`] : [])].join('; ')
  return { error: { code: 'invalid_request', message, refused: refused.slice(0, 500) } }
}

/** Whether the error chain names `text`, whatever layer of D1 wrapped it. */
function names(error: unknown, text: string): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes(text)) return true
  }
  return false
}

/** Whether a failed batch broke the cap. Any other constraint error is a bug, not a full account. */
function brokeCap(error: unknown): boolean {
  return names(error, 'users_lift_count_cap')
}

/**
 * The account's lift sets (lift-data.md, section 2): a page read, a write that inserts or replaces by
 * set key, and a delete. A write is two statements in one batch, the count and then the rows, so the
 * count of the cap can never drift from the rows.
 */
export const liftRoutes = new Hono<AppEnv>()

/**
 * One page in key order. The first page has no cursor term and the next ones a top-level row-value
 * term, so SQLite searches the primary key from the cursor on. One statement with an `?2 IS NULL OR`
 * guard made it use only user_id and re-read the account from the start on every page.
 */
function pageStatement(db: D1Database, userId: string, after: LiftSetIdentity | null) {
  if (after === null) {
    return db.prepare(PAGE_FIRST).bind(userId, LIFT_PAGE_SIZE + 1)
  }
  return db
    .prepare(PAGE_AFTER)
    .bind(userId, after.date, after.exercise, after.equipment, after.setOrder, LIFT_PAGE_SIZE + 1)
}

liftRoutes.get('/', sameOriginReadGuard, requireUser, async (c) => {
  const userId = currentUser(c).id
  const now = c.var.deps.now()
  const raw = c.req.query('cursor')
  let after: LiftSetIdentity | null = null
  if (raw !== undefined) {
    after = raw.length <= CURSOR_CHARS ? decodeLiftCursor(raw) : null
    if (after === null) throw new HttpError(400, 'invalid_request', 'Invalid cursor')
  }
  const read = await chargeDaily(c.env.DB, userId, 'liftRead', now)
  try {
    const [revision, page] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT lift_revision FROM users WHERE id = ?').bind(userId),
      pageStatement(c.env.DB, userId, after),
    ])
    const row = revision?.results[0] as { lift_revision: number } | undefined
    if (!row) throw new HttpError(401, 'unauthenticated', 'Sign in required')
    const rows = (page?.results ?? []) as unknown as LiftRow[]
    const items = rows.slice(0, LIFT_PAGE_SIZE).map(toLiftSet)
    const last = items[items.length - 1]
    // The rows read are paid for after the read, by what it returned, so a short library is cheap.
    await chargeDaily(
      c.env.DB,
      userId,
      'listRows',
      now,
      Math.max(items.length, 1),
      LIFT_ROWS_LIMIT_MESSAGE,
    )
    const body: LiftPageAnswer = {
      items,
      next: rows.length > LIFT_PAGE_SIZE && last ? encodeLiftCursor(last) : null,
      liftRevision: row.lift_revision,
    }
    return c.json(body, 200)
  } catch (error) {
    await read.refund()
    throw error
  }
})

/** Runs the count statement and the row statement as one batch, mapping a refusal to its answer. */
async function runBatch(
  db: D1Database,
  statements: [D1PreparedStatement, D1PreparedStatement],
  refund: () => Promise<void>,
) {
  try {
    const [counters, rows] = await db.batch(statements)
    const counted = counters?.results[0] as Counters | undefined
    if (!counted) {
      await refund()
      throw new HttpError(401, 'unauthenticated', 'Sign in required')
    }
    return { revision: counted.lift_revision, rows: rows?.results ?? [] }
  } catch (error) {
    // A write for a user row that is gone fails on the foreign key before RETURNING can come back empty.
    if (!(error instanceof HttpError) && names(error, 'FOREIGN KEY constraint failed')) {
      await refund()
      throw new HttpError(401, 'unauthenticated', 'Sign in required')
    }
    if (!(error instanceof HttpError) && brokeCap(error)) {
      await refund()
      throw new HttpError(
        409,
        'lift_limit',
        `You can keep up to ${MAX_LIFT_SETS_PER_USER.toLocaleString('en-US')} sets. Delete some to add more`,
      )
    }
    throw error
  }
}

liftRoutes.put(
  '/',
  limitBody(WRITE_BODY_BYTES),
  requireUser,
  zValidator('json', LiftWriteSchema, (result, c) => {
    if (!result.success) return c.json(refusal(result.error), 400)
  }),
  async (c) => {
    const { sets, insertOnly } = c.req.valid('json')
    const userId = currentUser(c).id
    const now = c.var.deps.now()
    const charge = await chargeDaily(c.env.DB, userId, 'liftWrite', now)
    const json = setsJson(sets)
    const db = c.env.DB
    const { revision, rows } = await runBatch(
      db,
      [
        db.prepare(COUNT_NEW_KEYS).bind(userId, json),
        insertOnly
          ? db.prepare(INSERT_NEW_SETS).bind(userId, json, now)
          : db.prepare(UPSERT_SETS).bind(userId, json, now),
      ],
      charge.refund,
    )
    const inserted = new Set(
      (rows as unknown as LiftRow[]).map((row) =>
        liftSetKey({
          date: row.date,
          exercise: row.exercise,
          equipment: row.equipment,
          setOrder: row.set_order,
        }),
      ),
    )
    const skipped = insertOnly
      ? [...new Set(sets.map(liftSetKey))].filter((key) => !inserted.has(key))
      : []
    const body: LiftWriteAnswer = { liftRevision: revision, skipped }
    return c.json(body, 200)
  },
)

/** A key with no stored set is not an error, so a resent delete settles. */
liftRoutes.post(
  '/delete',
  limitBody(DELETE_BODY_BYTES),
  requireUser,
  zValidator('json', LiftDeleteSchema, (result, c) => {
    if (!result.success) return c.json(refusal(result.error), 400)
  }),
  async (c) => {
    const { keys } = c.req.valid('json')
    const userId = currentUser(c).id
    const charge = await chargeDaily(c.env.DB, userId, 'liftWrite', c.var.deps.now())
    const json = identitiesJson(keys.map((key) => parseLiftSetKey(key) as LiftSetIdentity))
    const db = c.env.DB
    const { revision } = await runBatch(
      db,
      [db.prepare(COUNT_GONE_KEYS).bind(userId, json), db.prepare(DELETE_SETS).bind(userId, json)],
      charge.refund,
    )
    const body: LiftDeleteAnswer = { liftRevision: revision }
    return c.json(body, 200)
  },
)
