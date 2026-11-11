import type { AccountSettings } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import type { LiftSet } from '@rca/core/lift'
import type { ActivityDigest } from '@rca/core/types'

/** Everything the account's results are a function of, read at one `library_version`. */
export interface StateInputs {
  version: number
  /** `users.lift_revision` at the same read: a compute never records a revision it did not read at the same version. Read in the same batch as the sets below. */
  liftRevision: number
  /** The account's lift sets, in key order, as the Lift page reads them back from the listing. */
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

/** A stored dated-setting row. */
export interface MeasurementRow {
  kind: Measurement['kind']
  sport: '' | 'run' | 'ride'
  from_date: string
  value: number
}

/** A stored row as the settings carry it: the body mass has no sport, which is '' in the table. */
export function measurementOf(row: MeasurementRow): Measurement {
  return row.sport === ''
    ? { kind: row.kind, value: row.value, from: row.from_date }
    : { kind: row.kind, sport: row.sport, value: row.value, from: row.from_date }
}
