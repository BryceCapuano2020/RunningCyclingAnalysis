import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { AccountSettingsSchema, NO_ACCOUNT_SETTINGS } from '@rca/contract'
import type { AccountSettings } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { invalidRequest, limitBody } from '../http.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../middleware.ts'

/** 20,000 counted runs of about 17 bytes each, the most the app keeps, with room for the rest. */
const SETTINGS_BODY_BYTES = 512 * 1024

interface Row {
  keep_power: string | null
  counted_runs: string | null
  period: string | null
}

/** A stored column: its JSON, or null for a field never set. A value that does not parse reads as never set. */
function parsed(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A stored row as the API shows it. A row that no longer fits the schema reads as never saved. */
function toSettings(row: Row | null): AccountSettings {
  if (row === null) return NO_ACCOUNT_SETTINGS
  const read = AccountSettingsSchema.safeParse({
    keepPower: parsed(row.keep_power),
    countedRuns: parsed(row.counted_runs),
    period: parsed(row.period),
  })
  return read.success ? read.data : NO_ACCOUNT_SETTINGS
}

/**
 * The choices that used to live in one browser (accountSettings in the contract): the rides whose power is
 * kept, the runs counted at walking pace and the period. One row per account, replaced whole by a write.
 * Each read and write spends a daily unit of its own, so they cannot use up the library's read budget or
 * the profile's write budget.
 */
export const settingsRoutes = new Hono<AppEnv>()

settingsRoutes.get('/', sameOriginReadGuard, requireUser, async (c) => {
  const userId = currentUser(c).id
  await chargeDaily(c.env.DB, userId, 'settingsRead', c.var.deps.now())
  const row = await c.env.DB.prepare(
    'SELECT keep_power, counted_runs, period FROM athlete_settings WHERE user_id = ?',
  )
    .bind(userId)
    .first<Row>()
  return c.json(toSettings(row), 200)
})

settingsRoutes.put(
  '/',
  limitBody(SETTINGS_BODY_BYTES),
  requireUser,
  zValidator('json', AccountSettingsSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const input = c.req.valid('json')
    const userId = currentUser(c).id
    const now = c.var.deps.now()
    await chargeDaily(c.env.DB, userId, 'settingsWrite', now)
    const column = (value: unknown) => (value === null ? null : JSON.stringify(value))
    const saved = await c.env.DB.prepare(
      `INSERT INTO athlete_settings (user_id, keep_power, counted_runs, period, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET keep_power = excluded.keep_power,
         counted_runs = excluded.counted_runs, period = excluded.period, updated_at = excluded.updated_at
       RETURNING keep_power, counted_runs, period`,
    )
      .bind(userId, column(input.keepPower), column(input.countedRuns), column(input.period), now)
      .first<Row>()
    return c.json(toSettings(saved), 200)
  },
)
