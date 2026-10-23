/** Why an activity could not be saved to the signed-in library. Drives the user-facing message. */
export type SyncIssueCode =
  | 'signed-out'
  | 'account-changed'
  | 'activity-quota'
  | 'storage-quota'
  | 'storage-budget'
  | 'file-too-large'
  | 'rate-limited'
  | 'daily-limit'
  | 'upload-in-progress'
  | 'account-deleting'
  | 'digest-quota'
  | 'database-full'
  | 'activity-conflict'
  | 'network'
  | 'server'

export interface SyncIssue {
  code: SyncIssueCode
  /** Activities affected in the current library session. */
  count: number
}

/** A sink throws this to say why a save failed. Any other error is reported as 'server'. */
export class SyncFailure extends Error {
  readonly code: SyncIssueCode

  constructor(code: SyncIssueCode, message: string) {
    super(message)
    this.name = 'SyncFailure'
    this.code = code
  }
}

const HALTING_CODES: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'signed-out',
  'account-changed',
  'account-deleting',
  'digest-quota',
  'database-full',
])

/**
 * Whether a failure ends the import: once the account is signed out or changed, or the saved-analysis
 * storage or the database is full, later saves in the same import would fail the same way, so they
 * are not attempted.
 */
export function haltsImport(code: SyncIssueCode): boolean {
  return HALTING_CODES.has(code)
}
