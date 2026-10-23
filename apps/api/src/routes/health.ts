import { Hono } from 'hono'
import type { AppEnv } from '../env.ts'
import { HttpError } from '../errors.ts'
import { reserveHealthProbe } from '../healthBudget.ts'
import { healthRateLimit } from '../rateLimit.ts'

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
    if (error instanceof HttpError) throw error
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
 *
 * When the global probe budget is spent the deep check is skipped with 200, not failed: the uptime
 * monitor probes this route, and a spent budget is not an outage. Shallow /api/health still decides.
 */
healthRoutes.get('/deep', healthRateLimit, async (c) => {
  const { deps } = c.var
  const d1 = await timed(async () => {
    await c.env.DB.prepare('SELECT 1').first()
  })
  const files = c.env.FILES
  let budgetSpent = false
  const r2 = files
    ? await timed(async () => {
        try {
          await reserveHealthProbe(c.env.DB, deps.now())
        } catch (error) {
          if (error instanceof HttpError && error.code === 'health_probe_limit') {
            budgetSpent = true
            return
          }
          throw error
        }
        await files.head(HEALTH_SENTINEL_KEY)
      })
    : { ok: false, ms: 0 }
  c.header('Cache-Control', 'no-store')
  // A spent probe budget only skips this check. A failing D1 check is still reported as an outage.
  if (budgetSpent && d1.ok) {
    return c.json({ status: 'ok', deep: 'skipped', reason: 'deep health budget reached' }, 200)
  }
  const healthy = d1.ok && r2.ok
  return c.json({ status: healthy ? 'ok' : 'unavailable', checks: { d1, r2 } }, healthy ? 200 : 503)
})
