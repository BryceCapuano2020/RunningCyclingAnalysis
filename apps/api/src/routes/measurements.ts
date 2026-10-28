import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { MAX_MEASUREMENTS_PER_USER, MeasurementSchema, parseMeasurementKey } from '@rca/contract'
import type { MeasurementInput } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { chargeDaily } from '../budget.ts'
import { HttpError } from '../errors.ts'
import { invalidRequest, limitBody } from '../http.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../middleware.ts'

const MEASUREMENT_BODY_BYTES = 1024

interface Row {
  kind: MeasurementInput['kind']
  sport: '' | 'run' | 'ride'
  from_date: string
  value: number
}

/** A stored row as the API shows it. The body mass has no sport, which is '' in the table. */
function toMeasurement(row: Row): MeasurementInput {
  return {
    kind: row.kind,
    ...(row.sport === '' ? {} : { sport: row.sport }),
    value: row.value,
    from: row.from_date,
  }
}

/**
 * The account's dated settings: a body mass, maximum heart rate or threshold in effect from a local
 * date. They are small and capped (MAX_MEASUREMENTS_PER_USER), and each read and write spends a daily
 * unit of its own, so they cannot use up the library's read budget or the profile's write budget.
 */
export const measurementRoutes = new Hono<AppEnv>()

measurementRoutes.get('/', sameOriginReadGuard, requireUser, async (c) => {
  const userId = currentUser(c).id
  await chargeDaily(c.env.DB, userId, 'measurementRead', c.var.deps.now())
  const { results } = await c.env.DB.prepare(
    `SELECT kind, sport, from_date, value FROM athlete_measurements
     WHERE user_id = ? ORDER BY from_date, kind, sport LIMIT ?`,
  )
    .bind(userId, MAX_MEASUREMENTS_PER_USER)
    .all<Row>()
  return c.json({ items: results.map(toMeasurement) }, 200)
})

/**
 * Sets the value in effect from a date. The same kind, sport and date replaces the value, which
 * is how a typo is corrected. The count and the write are one statement, so two requests cannot
 * both take the last place; replacing an existing date never needs a place.
 */
measurementRoutes.put(
  '/',
  limitBody(MEASUREMENT_BODY_BYTES),
  requireUser,
  zValidator('json', MeasurementSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const entry = c.req.valid('json')
    const userId = currentUser(c).id
    const now = c.var.deps.now()
    const charge = await chargeDaily(c.env.DB, userId, 'measurementWrite', now)
    const sport = entry.sport ?? ''
    const stored = await c.env.DB.prepare(
      `INSERT INTO athlete_measurements (user_id, kind, sport, from_date, value, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE (SELECT COUNT(*) FROM athlete_measurements WHERE user_id = ?1) < ?7
          OR EXISTS (SELECT 1 FROM athlete_measurements
                     WHERE user_id = ?1 AND kind = ?2 AND sport = ?3 AND from_date = ?4)
       ON CONFLICT(user_id, kind, sport, from_date)
         DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       RETURNING kind, sport, from_date, value`,
    )
      .bind(userId, entry.kind, sport, entry.from, entry.value, now, MAX_MEASUREMENTS_PER_USER)
      .first<Row>()
    if (!stored) {
      await charge.refund()
      throw new HttpError(
        409,
        'measurement_limit',
        `You can keep up to ${MAX_MEASUREMENTS_PER_USER} dated settings. Delete one to add another`,
      )
    }
    return c.json(toMeasurement(stored), 200)
  },
)

/** Deletes one entry, named by its key such as `maxHeartRate.run.2026-03-01`. */
measurementRoutes.delete('/:key', requireUser, async (c) => {
  const identity = parseMeasurementKey(c.req.param('key'))
  if (identity === null) throw new HttpError(404, 'not_found', 'Setting not found')
  const userId = currentUser(c).id
  const charge = await chargeDaily(c.env.DB, userId, 'measurementWrite', c.var.deps.now())
  const removed = await c.env.DB.prepare(
    `DELETE FROM athlete_measurements
     WHERE user_id = ? AND kind = ? AND sport = ? AND from_date = ? RETURNING kind`,
  )
    .bind(userId, identity.kind, identity.sport ?? '', identity.from)
    .first()
  if (!removed) {
    await charge.refund()
    throw new HttpError(404, 'not_found', 'Setting not found')
  }
  return c.body(null, 204)
})
