import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env.ts'
import { serverStateFor } from './flag.ts'
import { STATE_DELAY_SECONDS } from './message.ts'
import { claimPending } from './pending.ts'

/** The routes whose writes change an input of the results. Lifts and sign-in do not, and neither does anything that reads. */
const INPUT_ROUTES = ['/api/activities', '/api/profile', '/api/measurements', '/api/settings']

/** An original file upload (PUT /api/activities/:id/file) changes no input of the results, so it sends nothing. */
const ORIGINAL_FILE = /^\/api\/activities\/[^/]+\/file$/

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * After a write that changed an input, tells the state job whose results to compute, delayed so a burst is one compute
 * (design: server-compute.md, section 1). The counter the job reads is raised by triggers in the same transaction as the
 * write, so a message that is lost or sent for a write that changed nothing costs nothing worse than a skipped job. A lost
 * message leaves the account dirty until its next write: the hourly refresh (S6 in the design) is not built. Only for the
 * accounts on the allowlist (SERVER_COMPUTE_USERS); for any other nothing is sent. Nor when a message for the account is
 * on its way already (pending.ts): the job it starts reads this write too, so a burst sends one message, not one per write.
 * Sending never fails the request, and a marker that cannot be read sends, so a D1 error costs a duplicate, never a write.
 */
export const stateEnqueue = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  const queue = c.env.STATE_QUEUE
  if (queue === undefined) return
  if (READS.has(c.req.method) || c.res.status >= 400) return
  const user = c.var.user
  if (user === null || !serverStateFor(c.env, user.id)) return
  const path = c.req.path
  if (ORIGINAL_FILE.test(path)) return
  if (!INPUT_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))) return
  const db = c.env.DB
  const userId = user.id
  const now = c.var.deps.now()
  const sent = claimPending(db, userId, now, STATE_DELAY_SECONDS)
    .catch(() => true)
    .then((claimed) =>
      claimed ? queue.send({ userId }, { delaySeconds: STATE_DELAY_SECONDS }) : undefined,
    )
    .catch(() => {
      console.error(JSON.stringify({ event: 'state_enqueue_failed' }))
    })
  try {
    c.executionCtx.waitUntil(sent)
  } catch {
    // No execution context (a test calling the app directly): the send is awaited instead.
    await sent
  }
})
