import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import { Hono } from 'hono'
import { STATE_DELAY_SECONDS, STATE_MIN_INTERVAL_SECONDS } from '../state/message.ts'
import { claimPending } from '../state/pending.ts'
import type { AppEnv, Bindings } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { HttpError } from '../errors.ts'
import { currentUser, requireUserOrNotFound, sameOriginReadGuard } from '../middleware.ts'
import { getOriginalFile } from '../storage.ts'
import { SERVER_STATE_MAX_ACTIVITIES, serverStateAnyone, serverStateFor } from '../state/flag.ts'
import { stateKey } from '../state/key.ts'
import { inflate } from '../state/store.ts'

/** What the read knows of the account's job: enough to tell whether asking for a compute again could help. */
interface StaleRow {
  activity_count: number
  attempted_at: number | null
}

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

stateRoutes.get('/', sameOriginReadGuard, async (c) => {
  const bucket = c.env.FILES!
  const userId = currentUser(c).id
  await chargeDaily(c.env.DB, userId, 'stateRead', c.var.deps.now())
  const row = await c.env.DB.prepare(
    `SELECT j.snapshot_hash, j.computed_version, j.analysis_revision, j.attempted_at, u.activity_count
     FROM state_jobs j JOIN users u ON u.id = j.user_id WHERE j.user_id = ?`,
  )
    .bind(userId)
    .first<
      StaleRow & {
        snapshot_hash: string | null
        computed_version: number
        analysis_revision: number
      }
    >()
  if (row?.snapshot_hash == null) throw NOT_FOUND()
  // A snapshot made under another analysis revision (a deploy changed how a figure is worked out) is not served: the
  // browser computes locally, and one message asks the job to compute it again under this build's analysis.
  if (row.analysis_revision !== ANALYSIS_REVISION) {
    await sendStale(c.env, userId, c.var.deps.now(), row)
    throw NOT_FOUND()
  }
  const etag = `"${row.snapshot_hash}"`
  // `no-store` like every /api response, so the browser never keeps a copy of the account's results in its HTTP cache. It
  // therefore sends no conditional request of its own: the client sets If-None-Match from the hash of its device copy.
  // `X-State-Computed-Version` is the library version the latest compute covered, for a client that knows a newer one.
  const headers = {
    ETag: etag,
    'Cache-Control': 'no-store',
    'X-State-Computed-Version': String(row.computed_version),
  }
  if (matches(c.req.header('If-None-Match'), etag)) return c.body(null, 304, headers)
  const object = await getOriginalFile(
    c.env.DB,
    bucket,
    stateKey(userId, row.snapshot_hash),
    c.var.deps.now,
  )
  // The row names an object that is gone (swept, or the put was lost): there is no snapshot to serve.
  if (object === null) throw NOT_FOUND()
  // An object an older Worker wrote (a rollback, a rolling deploy) carries no revision of its own while the row, which
  // that Worker does not keep, still says this one. It is stale: the row is marked so, and the job computes it again.
  if (object.customMetadata?.analysisRevision !== String(ANALYSIS_REVISION)) {
    await object.body.cancel().catch(() => undefined)
    await c.env.DB.prepare(
      'UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ? AND snapshot_hash = ?',
    )
      .bind(userId, row.snapshot_hash)
      .run()
    await sendStale(c.env, userId, c.var.deps.now(), row)
    throw NOT_FOUND()
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
})
