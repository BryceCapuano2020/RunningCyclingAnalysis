import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { claimCompute } from '../state/record.ts'
import {
  STATE_CLAIM_SECONDS,
  STATE_DELAY_SECONDS,
  STATE_MIN_INTERVAL_SECONDS,
} from '../state/message.ts'
import { claimPending } from '../state/pending.ts'
import type { AppEnv, Bindings } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { HttpError } from '../errors.ts'
import { currentUser, requireUserOrNotFound, sameOriginReadGuard } from '../middleware.ts'
import { getOriginalFile } from '../storage.ts'
import { SERVER_STATE_MAX_ACTIVITIES, serverStateAnyone, serverStateFor } from '../state/flag.ts'
import { stateKey } from '../state/key.ts'
import { inflate } from '../state/store.ts'
import { keepUnstored, unstoredFor, unstoredKey, withComputeLock } from '../state/lock.ts'
import { computeAndStore, type Computed } from '../state/refresh.ts'
import { isCurrent, jobRow, localDayOf, revisionOrder, type JobRow } from '../state/row.ts'

/** What the read knows of the account's job: enough to tell whether asking for a compute again could help. */
type StaleRow = Pick<JobRow, 'activity_count' | 'attempted_at'>

/**
 * Asks the state job to compute an account again, unless a message for it is on its way, the server does not compute for
 * a library this size, or a compute began within the minimum interval (one that failed, or one under way): a read never
 * sends once per open. Sending never fails the read.
 */
async function sendStale(env: Bindings, userId: string, now: number, row: StaleRow): Promise<void> {
  const queue = env.STATE_QUEUE
  if (queue === undefined) return
  if (row.activity_count > SERVER_STATE_MAX_ACTIVITIES) return
  if (now - (row.attempted_at ?? 0) < STATE_MIN_INTERVAL_SECONDS * 1000) return
  try {
    if (await claimPending(env.DB, userId, now, STATE_DELAY_SECONDS)) {
      await queue.send({ userId }, { delaySeconds: STATE_DELAY_SECONDS })
    }
  } catch {
    console.error(JSON.stringify({ event: 'state_stale_send_failed' }))
  }
}

const NOT_FOUND = () => new HttpError(404, 'not_found', 'Not found')

/** Whether the request's If-None-Match names this tag (or any: `*`). Weak tags compare by their value. */
function matches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === etag || tag === '*')
}

/**
 * The latest snapshot of the signed-in account's results, computed on the server (docs/design/server-compute.md). The
 * ETag is the snapshot's content hash, so a browser that holds it is answered 304 without the object being read. The
 * session's own user id is the only key: no id comes from the request. 404 when the account is not on the allowlist or the account has no
 * snapshot yet (a library the server does not compute for, a job not run), and the browser then computes locally.
 */
export const stateRoutes = new Hono<AppEnv>()

// With no account on the allowlist the route is not there for anyone, signed in or not.
stateRoutes.use('*', async (c, next) => {
  if (!serverStateAnyone(c.env) || c.env.FILES === undefined) throw NOT_FOUND()
  await next()
})

// A signed-out request and an account off the list get the answer they would get with the list empty, before the
// cross-site check and before any budget is spent: no status tells an outsider the feature is on for someone.
stateRoutes.use('*', requireUserOrNotFound, async (c, next) => {
  if (!serverStateFor(c.env, currentUser(c).id)) throw NOT_FOUND()
  await next()
})

/** Seconds a client waits before asking again when the answer is still being computed. */
const COMPUTING_RETRY_SECONDS = 2

type Ctx = Context<AppEnv>

/** What every answer about a snapshot carries: its tag, no caching, and the instant it was computed for. */
function headersFor(hash: string, nowMs: number, version: number): Record<string, string> {
  // `no-store` like every /api response, so the browser never keeps a copy of the account's results in its HTTP cache. It
  // therefore sends no conditional request of its own: the client sets If-None-Match from the hash of its device copy.
  // `X-State-Computed-Version` is the library version the stored snapshot covers, for a client that knows a newer one.
  // `X-State-Now` is the instant the snapshot was computed for, a 304 included: an unchanged recompute moves it.
  return {
    ETag: `"${hash}"`,
    'Cache-Control': 'no-store',
    'X-State-Computed-Version': String(version),
    // 0 is a row no compute has stamped yet (migration 0019's backfill): there is no instant to name.
    ...(nowMs === 0 ? {} : { 'X-State-Now': String(nowMs) }),
  }
}

const computing = (c: Ctx) =>
  c.json({ state: 'computing' }, 202, {
    'Retry-After': String(COMPUTING_RETRY_SECONDS),
    'Cache-Control': 'no-store',
  })

/** A computed result as an answer: a 304 for a client holding its tag, else the snapshot as plain JSON. */
function answer(c: Ctx, done: Extract<Computed, { snapshot: unknown }>): Response {
  const headers = headersFor(done.hash, done.nowMs, done.version)
  if (matches(c.req.header('If-None-Match'), headers.ETag!)) return c.body(null, 304, headers)
  return c.body(JSON.stringify(done.snapshot), 200, {
    ...headers,
    'Content-Type': 'application/json',
  })
}

/**
 * The stored snapshot as an answer. A 304 is free and reads no object; a body costs a unit of the read budget, unless
 * `under` says this isolate is computing and the stored one is served in its place (then `X-State-Current: 0`, and nothing
 * is charged). Returns 'stale' for an object an older Worker wrote (its metadata names no revision of this build's): the
 * row is marked so and the caller computes it again.
 */
async function serveStored(c: Ctx, row: JobRow, under: boolean): Promise<Response | 'stale'> {
  const userId = currentUser(c).id
  const hash = row.snapshot_hash!
  const headers: Record<string, string> = {
    ...headersFor(hash, row.snapshot_now_ms ?? 0, row.snapshot_version ?? 0),
    ...(under ? { 'X-State-Current': '0' } : {}),
  }
  if (matches(c.req.header('If-None-Match'), headers.ETag!)) return c.body(null, 304, headers)
  const charge = under
    ? undefined
    : await chargeDaily(c.env.DB, userId, 'stateRead', c.var.deps.now())
  const object = await getOriginalFile(
    c.env.DB,
    c.env.FILES!,
    stateKey(userId, hash),
    c.var.deps.now,
  )
  if (object === null) {
    // The row names an object that is gone (swept, or the put was lost): the row is reset, with the same hash guard, and
    // the caller computes it again in this read. No unit is kept for a read that served nothing.
    if (!under) await charge?.refund().catch(() => undefined)
    await c.env.DB.prepare(
      'UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ? AND snapshot_hash = ?',
    )
      .bind(userId, hash)
      .run()
    return 'stale'
  }
  // An object an older Worker wrote (a rollback, a rolling deploy) carries no revision of its own while the row, which
  // that Worker does not keep, still says this one. Only a lower revision is reset: a later Worker's is left alone.
  if (Number(object.customMetadata?.analysisRevision ?? 0) < ANALYSIS_REVISION) {
    await object.body.cancel().catch(() => undefined)
    await charge?.refund().catch(() => undefined)
    await c.env.DB.prepare(
      'UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ? AND snapshot_hash = ?',
    )
      .bind(userId, hash)
      .run()
    return 'stale'
  }
  const gzip = /\bgzip\b/i.test(c.req.header('Accept-Encoding') ?? '')
  const contentHeaders = { ...headers, 'Content-Type': 'application/json' }
  if (!gzip) return c.body(inflate(object.body), 200, contentHeaders)
  // Sent as stored, and said to be: `encodeBody: 'manual'` keeps the runtime from compressing the gzipped bytes again (it
  // would otherwise read the header as a promise to encode a plain body, and the browser would unzip to a second layer).
  return new Response(object.body, {
    encodeBody: 'manual',
    headers: { ...contentHeaders, 'Content-Encoding': 'gzip' },
  })
}

/**
 * Computes in the request, under the isolate's lock. The unit of read budget is taken inside the lock and given back when
 * the compute comes to nothing. `store` is false when the stored snapshot is a later Worker's: the result is then kept in
 * the isolate for the next read and the row and bucket are not touched. Null when the lock is taken or another isolate holds the claim (`claimCompute`).
 */
async function computeInRequest(
  c: Ctx,
  row: JobRow,
  store: boolean,
  claim: { held: boolean; refused?: HttpError },
): Promise<Computed | null> {
  const userId = currentUser(c).id
  const run = await withComputeLock(async () => {
    let charge
    try {
      charge = await chargeDaily(c.env.DB, userId, 'stateRead', c.var.deps.now())
    } catch (error) {
      // Over the day's budget: no compute and no claim stamped, but the stored copy is free (the caller serves it).
      if (!(error instanceof HttpError) || error.status !== 429) throw error
      claim.refused = error
      return null
    }
    // The claim is taken once per request, after the budget unit (a refused read must not stamp attempted_at and defer
    // the queue): a second read of the inputs after a write moved them is still this request's.
    if (store && !claim.held) {
      claim.held = await claimCompute(c.env.DB, userId, c.var.deps.now(), CLAIM_MS)
      if (!claim.held) {
        // Another isolate, or another tab, began a compute a moment ago: this read serves what is stored.
        await charge.refund().catch(() => undefined)
        return null
      }
    }
    let done: Computed
    try {
      done = await computeAndStore(c.env, c.var.deps, userId, row, store, true)
    } catch (error) {
      await charge.refund().catch(() => undefined)
      throw error
    }
    if (done.kind === 'gone' || done.kind === 'moved') await charge.refund().catch(() => undefined)
    return done
  })
  return run.ran ? run.value : null
}

const CLAIM_MS = STATE_CLAIM_SECONDS * 1000

stateRoutes.get('/', sameOriginReadGuard, async (c) => {
  const userId = currentUser(c).id
  const now = c.var.deps.now()
  let row = await jobRow(c.env.DB, userId)
  if (row === null) throw NOT_FOUND()
  // A library past the limit is the browser's to compute (until the cap is measured and moved): the stored snapshot is
  // served while it is this build's, and one message asks for a new one when it is not.
  if (row.activity_count > SERVER_STATE_MAX_ACTIVITIES) {
    if (revisionOrder(row) !== 'same') {
      await sendStale(c.env, userId, now, row)
      throw NOT_FOUND()
    }
    const served = await serveStored(c, row, false)
    if (served === 'stale') throw NOT_FOUND()
    return served
  }
  const claim: { held: boolean; refused?: HttpError } = { held: false }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = revisionOrder(row)
    if (isCurrent(row, now)) {
      const served = await serveStored(c, row, false)
      if (served !== 'stale') return served
      // The object was an older Worker's: the row is reset, and the same read computes it again.
      const reset = await jobRow(c.env.DB, userId)
      if (reset === null) throw NOT_FOUND()
      row = reset
      continue
    }
    const key = unstoredKey(
      userId,
      row.library_version,
      row.lift_revision,
      localDayOf(row.zone, now),
    )
    const kept = order === 'newer' ? unstoredFor(key) : undefined
    if (kept !== undefined) {
      const headers = headersFor(kept.hash, kept.nowMs, kept.version)
      if (matches(c.req.header('If-None-Match'), headers.ETag!)) return c.body(null, 304, headers)
      await chargeDaily(c.env.DB, userId, 'stateRead', now)
      return c.body(kept.json, 200, { ...headers, 'Content-Type': 'application/json' })
    }
    const done = await computeInRequest(c, row, order !== 'newer', claim)
    if (done === null) {
      // Over budget with no stored copy of this build's to serve: the refusal stands.
      if (claim.refused !== undefined && order !== 'same') throw claim.refused
      // Computing for another read: serve what is stored while it is this build's own, else say it is coming.
      if (order === 'same') {
        const served = await serveStored(c, row, true)
        if (served !== 'stale') return served
      }
      return computing(c)
    }
    if (done.kind === 'gone' || done.kind === 'busy') throw NOT_FOUND()
    if (done.kind === 'moved') {
      // A write landed while the inputs were read: read the row again, once. The claim is stamped again first, since the
      // first read may have run longer than its window and another isolate would then compute alongside.
      await c.env.DB.prepare('UPDATE state_jobs SET attempted_at = ? WHERE user_id = ?')
        .bind(c.var.deps.now(), userId)
        .run()
      const again = await jobRow(c.env.DB, userId)
      if (again === null) throw NOT_FOUND()
      row = again
      continue
    }
    if (done.kind === 'unstored') {
      keepUnstored(
        unstoredKey(userId, done.version, done.liftRevision, localDayOf(row.zone, done.nowMs)),
        {
          hash: done.hash,
          json: JSON.stringify(done.snapshot),
          nowMs: done.nowMs,
          version: done.version,
        },
      )
    }
    return answer(c, done)
  }
  return computing(c)
})
