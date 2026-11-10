import { NO_ACCOUNT_SETTINGS } from '@rca/contract'
import type { AccountSettings, ActivityRecord, Profile } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import type { LiftSet } from '@rca/core/lift'

/** Identifies the file, and says which schema describes it. A later schema changes `version`. */
export const EXPORT_FORMAT = 'rca-export' as const
export const EXPORT_VERSION = 4 as const
/** Written into every export, so a reader knows what the file leaves out and how values look. */
export const EXPORT_NOTES = [
  'Original files are not included.',
  'Values that are not numbers are written as null.',
] as const

export interface ExportAccount {
  name: string
  email: string
}

export interface ExportActivity {
  id: string
  sport: ActivityRecord['digest']['sport']
  startMs: number
  name: string
  fileName: string
  hasFile: boolean
  createdAt: number
  digest: ActivityRecord['digest']
}

export interface AccountExport {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  account: ExportAccount
  profile: Profile
  /** The dated settings: body mass, max heart rate and thresholds, each from a local date. */
  measurements: Measurement[]
  /** The rides whose power was kept, the runs counted at walking pace and the period; null for one never set. */
  settings: AccountSettings
  /** Every logged lifting set, in key order. */
  lifts: LiftSet[]
  activities: ExportActivity[]
  /** Stored activities that could not be read, so they are not in `activities`. */
  unreadable: number
  notes: string[]
}

export interface AccountExportHeaderInput {
  now: Date
  account: ExportAccount
  profile: Profile
  /** Absent reads as none. */
  measurements?: readonly Measurement[]
  /** Absent reads as none set. */
  settings?: AccountSettings
}

export interface AccountExportInput extends AccountExportHeaderInput {
  /** Absent reads as none. */
  lifts?: readonly LiftSet[]
  activities: readonly ActivityRecord[]
  unreadable: number
}

/** The fields that come before the activities, in the order the file writes them. */
function headerFields(input: AccountExportHeaderInput) {
  const { account, profile } = input
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: input.now.toISOString(),
    account: { name: account.name, email: account.email },
    profile: {
      massKg: profile.massKg,
      bikeMassKg: profile.bikeMassKg,
      units: profile.units,
      keepFiles: profile.keepFiles,
      birthYear: profile.birthYear,
      sex: profile.sex,
      updatedAt: profile.updatedAt,
    },
    measurements: (input.measurements ?? []).map(measurementEntry),
    settings: settingsEntry(input.settings ?? NO_ACCOUNT_SETTINGS),
  }
}

/** The account settings, with their fields in the order the file writes them. */
function settingsEntry(settings: AccountSettings): AccountSettings {
  return {
    keepPower: settings.keepPower === null ? null : [...settings.keepPower],
    countedRuns: settings.countedRuns === null ? null : [...settings.countedRuns],
    period: settings.period,
  }
}

/** One dated setting, with its fields in the order the file writes them. */
function measurementEntry(entry: Measurement): Measurement {
  return {
    kind: entry.kind,
    ...(entry.sport === undefined ? {} : { sport: entry.sport }),
    value: entry.value,
    from: entry.from,
  }
}

/** One lifting set, with its fields in the order the file writes them and the optional ones only when set. */
function liftEntry(set: LiftSet): LiftSet {
  return {
    date: set.date,
    ...(set.time === undefined ? {} : { time: set.time }),
    ...(set.timePrecision === undefined ? {} : { timePrecision: set.timePrecision }),
    exercise: set.exercise,
    equipment: set.equipment,
    setOrder: set.setOrder,
    reps: set.reps,
    loadKg: set.loadKg,
    ...(set.rpe === undefined ? {} : { rpe: set.rpe }),
    ...(set.warmup === undefined ? {} : { warmup: set.warmup }),
  }
}

/** One activity, with its fields in the order the file writes them. */
function activityEntry(record: ActivityRecord): ExportActivity {
  return {
    id: record.id,
    sport: record.digest.sport,
    startMs: record.digest.startMs,
    name: record.digest.name,
    fileName: record.fileName,
    hasFile: record.hasFile,
    createdAt: record.createdAt,
    digest: record.digest,
  }
}

/**
 * The export document as an object. Every object is built field by field, so nothing beyond the
 * schema is written, even when the input carries more. The streamed writers below must match it.
 */
export function buildAccountExport(input: AccountExportInput): AccountExport {
  return {
    ...headerFields(input),
    lifts: (input.lifts ?? []).map(liftEntry),
    activities: input.activities.map(activityEntry),
    unreadable: input.unreadable,
    notes: [...EXPORT_NOTES],
  }
}

/**
 * The start of the file, up to and including the opening of the lift list. It is compact JSON
 * with the same key order as the object above.
 */
export function exportHeaderJson(input: AccountExportHeaderInput): string {
  // Drop the closing brace of the header object, and open the lift list in its place.
  return `${JSON.stringify(headerFields(input)).slice(0, -1)},"lifts":[`
}

/** Some lifting sets as comma-separated entries, with no brackets, like the activity pages. */
export function exportLiftsJson(sets: readonly LiftSet[]): string {
  return sets.map((set) => JSON.stringify(liftEntry(set))).join(',')
}

/** Between the lifts and the activities: the close of the lift list and the opening of the next. */
export const EXPORT_LIFTS_END_JSON = '],"activities":['

/**
 * Some activities as comma-separated entries, with no brackets, so pages can be joined with commas.
 * An empty page gives an empty string.
 */
export function exportActivitiesJson(records: readonly ActivityRecord[]): string {
  return records.map((record) => JSON.stringify(activityEntry(record))).join(',')
}

/** The end of the file: the close of the activity list, then the unreadable count and the notes. */
export function exportFooterJson(unreadable: number): string {
  // Keep the opening brace out, since the list close and a comma come first.
  return `],${JSON.stringify({ unreadable, notes: EXPORT_NOTES }).slice(1)}`
}
