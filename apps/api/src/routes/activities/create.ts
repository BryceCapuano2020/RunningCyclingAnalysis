import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { MAX_DIGEST_BYTES } from '@rca/contract'
import type { AppEnv } from '../../env.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { invalidRequest, limitBody } from '../../http.ts'
import { readJsonBody } from './shared.ts'
import { saveContext, saveDigest } from './saveDigest.ts'

/** The digest limit applies to its JSON; the envelope (name, hash) gets this much headroom. */
const MAX_CREATE_BODY_BYTES = MAX_DIGEST_BYTES + 16 * 1024

const createQuery = z.object({
  /** Updates this exact activity, owned by the caller, instead of inserting one. */
  replace: z.string().min(1).max(64).optional(),
})

export const createRoutes = new Hono<AppEnv>()

createRoutes.post(
  '/',
  limitBody(MAX_CREATE_BODY_BYTES),
  requireUser,
  zValidator('query', createQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { replace } = c.req.valid('query')
    const body = await readJsonBody(c.req.raw, MAX_CREATE_BODY_BYTES)
    const ctx = saveContext(c.env, c.var.deps, c.var.db)
    const saved = await saveDigest(ctx, currentUser(c).id, body, { replace })
    return c.json(saved.record, saved.status)
  },
)
