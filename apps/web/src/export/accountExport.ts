import type { ActivityRecord, Profile } from '@rca/contract'

/** Identifies the file, and says which schema describes it. A later schema changes `version`. */
export const EXPORT_FORMAT = 'rca-export' as const
export const EXPORT_VERSION = 1 as const
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
  activities: ExportActivity[]
  /** Stored activities the server could not read, so they are not in `activities`. */
  unreadable: number
  notes: string[]
}

export interface AccountExportHeaderInput {
  now: Date
  account: ExportAccount
  profile: Profile
}

export interface AccountExportInput extends AccountExportHeaderInput {
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
    activities: input.activities.map(activityEntry),
    unreadable: input.unreadable,
    notes: [...EXPORT_NOTES],
  }
}

/**
 * The start of the file, up to and including the opening of the activity list. It is compact JSON
 * with the same key order as the object above.
 */
export function exportHeaderJson(input: AccountExportHeaderInput): string {
  // Drop the closing brace of the header object, and open the activity list in its place.
  return `${JSON.stringify(headerFields(input)).slice(0, -1)},"activities":[`
}

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
