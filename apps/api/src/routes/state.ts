import { Hono } from 'hono'
import type { AppEnv } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { HttpError } from '../errors.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../middleware.ts'
import { getOriginalFile } from '../storage.ts'
import { serverStateAnyone, serverStateFor } from '../state/flag.ts'
import { stateKey } from '../state/key.ts'
import { inflate } from '../state/store.ts'

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

stateRoutes.get('/', sameOriginReadGuard, requireUser, async (c) => {
  const bucket = c.env.FILES!
  const userId = currentUser(c).id
  // An account off the allowlist gets the answer it would get with the feature off, before any budget is spent.
  if (!serverStateFor(c.env, userId)) throw NOT_FOUND()
  await chargeDaily(c.env.DB, userId, 'stateRead', c.var.deps.now())
  const row = await c.env.DB.prepare('SELECT snapshot_hash FROM state_jobs WHERE user_id = ?')
    .bind(userId)
    .first<{ snapshot_hash: string | null }>()
  if (row?.snapshot_hash == null) throw NOT_FOUND()
  const etag = `"${row.snapshot_hash}"`
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (matches(c.req.header('If-None-Match'), etag)) return c.body(null, 304, headers)
  const object = await getOriginalFile(
    c.env.DB,
    bucket,
    stateKey(userId, row.snapshot_hash),
    c.var.deps.now,
  )
  // The row names an object that is gone (swept, or the put was lost): there is no snapshot to serve.
  if (object === null) throw NOT_FOUND()
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
