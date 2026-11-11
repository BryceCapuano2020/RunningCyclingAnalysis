import { DEFAULT_BIKE_MASS_KG, StoredActivityDigestSchema } from '@rca/contract'
import type { AccountSettings } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import type { LiftSet } from '@rca/core/lift'
import type { ActivityDigest } from '@rca/core/types'
import { toLiftSet, type LiftRow } from '../routes/liftSql.ts'
import { toSettings, type SettingsRow } from './settingsRow.ts'

/** Digest rows read in one query: about half a megabyte at a typical 5 KiB each. */
const PAGE_ROWS = 100

/** Everything the account's results are a function of, read at one `library_version`. */
export interface StateInputs {
  version: number
  /** `users.lift_revision` at the same read: a compute never records a revision whose sets it did not read. */
  liftRevision: number
  /** The account's lift sets in key order. Read with the version so a write is caught; no figure takes them yet. */
  liftSets: LiftSet[]
  digests: ActivityDigest[]
  /** Rows whose digest would not parse (skipped, as the browser skips them). */
  unreadable: number
  massKg: number | null
  bikeMassKg: number
  birthYear: number | null
  sex: 'female' | 'male' | null
  measurements: Measurement[]
  settings: AccountSettings
}

/** A write landed while the digests were being read, so the inputs are not one version. The write has sent its own job. */
export class InputsMoved extends Error {}

interface ProfileRow {
  mass_kg: number | null
  bike_mass_kg: number
  birth_year: number | null
  sex: 'female' | 'male' | null
}

interface MeasurementRow {
  kind: Measurement['kind']
  sport: '' | 'run' | 'ride'
  from_date: string
  value: number
}

interface DigestRow {
  id: string
  created_at: number
  digest_json: string
}

interface Counters {
  library_version: number
  lift_revision: number
}

const COUNTERS =
  'SELECT library_version, lift_revision FROM users WHERE id = ? AND deleting_at IS NULL'

async function countersOf(db: D1Database, userId: string): Promise<Counters | null> {
  return db.prepare(COUNTERS).bind(userId).first<Counters>()
}

/**
 * The account's inputs as of one version (decision 6): the library version, the lift revision and every small input
 * (the lift sets included) in one D1 batch, which is one transaction, then the digests in pages by the listing's own key,
 * then both counters again. A write to either between the two reads raises it, and the read is refused (`InputsMoved`)
 * instead of mixing two versions. Null when the account is gone or deleting.
 */
export async function readInputs(db: D1Database, userId: string): Promise<StateInputs | null> {
  const [counters, profile, measurements, settings, lifts] = await db.batch([
    db.prepare(COUNTERS).bind(userId),
    db
      .prepare('SELECT mass_kg, bike_mass_kg, birth_year, sex FROM profiles WHERE user_id = ?')
      .bind(userId),
    db
      .prepare(
        `SELECT kind, sport, from_date, value FROM athlete_measurements
         WHERE user_id = ? ORDER BY from_date, kind, sport`,
      )
      .bind(userId),
    db
      .prepare(
        'SELECT keep_power, counted_runs, period, zone FROM athlete_settings WHERE user_id = ?',
      )
      .bind(userId),
    db
      .prepare(
        `SELECT date, exercise, equipment, set_order, reps, load_kg, rpe, warmup, time, time_precision
         FROM lift_sets WHERE user_id = ? ORDER BY date, exercise, equipment, set_order`,
      )
      .bind(userId),
  ])
  const start = (counters!.results as Counters[])[0]
  if (start === undefined) return null
  const digests: ActivityDigest[] = []
  let unreadable = 0
  let after: { createdAt: number; id: string } | undefined
  for (;;) {
    const page = await db
      .prepare(
        `SELECT id, created_at, digest_json FROM activities
         WHERE user_id = ?1 AND (?2 IS NULL OR (created_at, id) > (?2, ?3))
         ORDER BY created_at, id LIMIT ?4`,
      )
      .bind(userId, after?.createdAt ?? null, after?.id ?? '', PAGE_ROWS)
      .all<DigestRow>()
    for (const row of page.results) {
      const read = readDigest(row.digest_json)
      if (read === null) unreadable += 1
      else digests.push(read)
    }
    const last = page.results.at(-1)
    if (last === undefined || page.results.length < PAGE_ROWS) break
    after = { createdAt: last.created_at, id: last.id }
  }
  const end = await countersOf(db, userId)
  if (end?.library_version !== start.library_version || end.lift_revision !== start.lift_revision) {
    throw new InputsMoved()
  }
  const own = (profile!.results as ProfileRow[])[0]
  return {
    version: start.library_version,
    liftRevision: start.lift_revision,
    liftSets: (lifts!.results as LiftRow[]).map(toLiftSet),
    digests,
    unreadable,
    massKg: own?.mass_kg ?? null,
    bikeMassKg: own?.bike_mass_kg ?? DEFAULT_BIKE_MASS_KG,
    birthYear: own?.birth_year ?? null,
    sex: own?.sex ?? null,
    measurements: (measurements!.results as MeasurementRow[]).map(measurementOf),
    settings: toSettings(((settings!.results as SettingsRow[])[0] ?? null) as SettingsRow | null),
  }
}

/** A stored row as the settings carry it: the body mass has no sport, which is '' in the table. */
function measurementOf(row: MeasurementRow): Measurement {
  return row.sport === ''
    ? { kind: row.kind, value: row.value, from: row.from_date }
    : { kind: row.kind, sport: row.sport, value: row.value, from: row.from_date }
}

/** A stored digest as the browser reads it back from the listing (the same schema), or null when it will not parse. */
function readDigest(text: string): ActivityDigest | null {
  try {
    const read = StoredActivityDigestSchema.safeParse(JSON.parse(text))
    return read.success ? read.data : null
  } catch {
    return null
  }
}
