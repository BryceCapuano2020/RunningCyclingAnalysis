import { Hono } from 'hono'
import type { AppEnv } from '../env.ts'
import { healthRateLimit } from '../rateLimit.ts'
import { reserveR2Operation } from '../storage.ts'

/** Never written; a HEAD on a missing key still proves the bucket answers. */
export const HEALTH_SENTINEL_KEY = 'health/sentinel'

interface Check {
  ok: boolean
  ms: number
}

async function timed(run: () => Promise<void>): Promise<Check> {
  const started = Date.now()
  try {
    await run()
    return { ok: true, ms: Date.now() - started }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'health_check_failed',
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
      }),
    )
    return { ok: false, ms: Date.now() - started }
  }
}

export const healthRoutes = new Hono<AppEnv>()

/**
 * Deep health: D1 answers SELECT 1 and R2 answers a HEAD. 200 when both pass, 503 otherwise, with
 * a JSON body of per-check timings. Rate limited on its own, and never cached.
 */
healthRoutes.get('/deep', healthRateLimit, async (c) => {
  const { deps } = c.var
  const d1 = await timed(async () => {
    await c.env.DB.prepare('SELECT 1').first()
  })
  const files = c.env.FILES
  const r2 = files
    ? await timed(async () => {
        await reserveR2Operation(c.env.DB, deps.now())
        await files.head(HEALTH_SENTINEL_KEY)
      })
    : { ok: false, ms: 0 }
  const healthy = d1.ok && r2.ok
  c.header('Cache-Control', 'no-store')
  return c.json({ status: healthy ? 'ok' : 'unavailable', checks: { d1, r2 } }, healthy ? 200 : 503)
})
