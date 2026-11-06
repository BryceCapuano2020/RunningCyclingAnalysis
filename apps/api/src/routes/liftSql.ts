import type { LiftSet, LiftSetIdentity } from '@rca/core/lift'

/**
 * The statements behind the lift routes (lift-data.md, section 2). A write is two statements run as
 * one D1 batch, whatever its size: the sets travel as one JSON text read with json_each, because a
 * statement binds at most 100 values and a set is about 12. Every statement names user_id.
 */

/** The payload's distinct keys as rows `(d, x, q, o)`: date, exercise, equipment, set order. */
const PAYLOAD_KEYS = `SELECT DISTINCT json_extract(value, '$.date') AS d, json_extract(value, '$.exercise') AS x,
  json_extract(value, '$.equipment') AS q, json_extract(value, '$.setOrder') AS o FROM json_each(?2)`

const HAS_ROW = `EXISTS (SELECT 1 FROM lift_sets s WHERE s.user_id = ?1 AND s.date = k.d
  AND s.exercise = k.x AND s.equipment = k.q AND s.set_order = k.o)`

const COUNT_AND_REVISION = `RETURNING lift_count, lift_revision`

/** Adds the payload's keys that have no stored row to the count, and raises the revision. */
export const COUNT_NEW_KEYS = `UPDATE users SET
  lift_count = lift_count + (SELECT COUNT(*) FROM (${PAYLOAD_KEYS}) k WHERE NOT ${HAS_ROW}),
  lift_revision = lift_revision + 1 WHERE id = ?1 ${COUNT_AND_REVISION}`

/** Takes the payload's keys that have a stored row off the count, and raises the revision. */
export const COUNT_GONE_KEYS = `UPDATE users SET
  lift_count = lift_count - (SELECT COUNT(*) FROM (${PAYLOAD_KEYS}) k WHERE ${HAS_ROW}),
  lift_revision = lift_revision + 1 WHERE id = ?1 ${COUNT_AND_REVISION}`

const INSERT_SETS = `INSERT INTO lift_sets (user_id, date, exercise, equipment, set_order, reps, load_kg,
  rpe, warmup, time, time_precision, updated_at)
  SELECT ?1, json_extract(value, '$.date'), json_extract(value, '$.exercise'),
    json_extract(value, '$.equipment'), json_extract(value, '$.setOrder'), json_extract(value, '$.reps'),
    json_extract(value, '$.loadKg'), json_extract(value, '$.rpe'),
    coalesce(json_extract(value, '$.warmup'), 0), json_extract(value, '$.time'),
    json_extract(value, '$.timePrecision'), ?3
  FROM json_each(?2) WHERE true
  ON CONFLICT (user_id, date, exercise, equipment, set_order)`

/** Insert or replace by key. */
export const UPSERT_SETS = `${INSERT_SETS} DO UPDATE SET reps = excluded.reps, load_kg = excluded.load_kg,
  rpe = excluded.rpe, warmup = excluded.warmup, time = excluded.time,
  time_precision = excluded.time_precision, updated_at = excluded.updated_at`

/** Keep stored sets; the rows it returns are the keys it inserted, so the rest were skipped. */
export const INSERT_NEW_SETS = `${INSERT_SETS} DO NOTHING RETURNING date, exercise, equipment, set_order`

/** The delete is one primary-key search per key (pinned by an EXPLAIN QUERY PLAN test). */
export const DELETE_SETS = `DELETE FROM lift_sets WHERE user_id = ?1
  AND (date, exercise, equipment, set_order) IN (SELECT d, x, q, o FROM (${PAYLOAD_KEYS}))`

/** The JSON text bound as ?2 for a write. */
export const setsJson = (sets: readonly LiftSet[]): string => JSON.stringify(sets)

/** The JSON text bound as ?2 for a delete: the keys as `{ date, exercise, equipment, setOrder }`. */
export const identitiesJson = (keys: readonly LiftSetIdentity[]): string => JSON.stringify(keys)

/** A stored row as a LiftSet: absent options stay absent, warmup is `true` or absent. */
export interface LiftRow {
  date: string
  exercise: string
  equipment: LiftSet['equipment']
  set_order: number
  reps: number
  load_kg: number
  rpe: number | null
  warmup: number
  time: string | null
  time_precision: LiftSet['timePrecision'] | null
}

export function toLiftSet(row: LiftRow): LiftSet {
  return {
    date: row.date,
    ...(row.time === null || row.time_precision === null
      ? {}
      : { time: row.time, timePrecision: row.time_precision }),
    exercise: row.exercise,
    equipment: row.equipment,
    setOrder: row.set_order,
    reps: row.reps,
    loadKg: row.load_kg,
    ...(row.rpe === null ? {} : { rpe: row.rpe }),
    ...(row.warmup === 1 ? { warmup: true as const } : {}),
  }
}
