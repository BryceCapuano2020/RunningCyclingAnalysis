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
  /** Of `count`, those the most recent import left. Absent when it left all of them. */
  latest?: number
}

/** A sink throws this to say why a save failed. Any other error is reported as 'server'. */
export class SyncFailure extends Error {
  readonly code: SyncIssueCode
  /**
   * True when the activity's digest was saved and only a later step failed, such as uploading its
   * original file. The server answered, so it says nothing about the network being down.
   */
  readonly digestSaved: boolean

  constructor(code: SyncIssueCode, message: string, digestSaved = false) {
    super(message)
    this.name = 'SyncFailure'
    this.code = code
    this.digestSaved = digestSaved
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

/** The limits an import can run into: the library's size, the day's saves, and the request rate. */
const LIMIT_CODES: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'activity-quota',
  'daily-limit',
  'rate-limited',
])

/**
 * Whether a failure stops the import's saves. A halting failure does, and so does a limit: once the
 * library is full, the day's saves are spent, or the request rate is held (after the sink waited out
 * the server's Retry-After and tried once more), later saves in the same import would be refused the
 * same way. The activities after it are still analysed, and are counted as waiting to be saved.
 */
export function stopsSaving(code: SyncIssueCode): boolean {
  return haltsImport(code) || LIMIT_CODES.has(code)
}

/**
 * How many network failures in a row make the import stop and probe. One lost request can be a blip,
 * but with the network down every save costs a round trip (a second, or its whole timeout when the
 * request hangs), which across thousands of activities is minutes of waiting for nothing.
 */
export const NETWORK_FAILURES_BEFORE_PROBE = 3

/**
 * How long the import waits after those failures before the next save, which is the probe. A short
 * outage, such as a Wi-Fi network changing, is over by then, and the import carries on. If the probe
 * fails too, the saves stop.
 */
export const NETWORK_PROBE_DELAY_MS = 2_000

/**
 * The count of consecutive network failures after a save: one more for a network failure, and none
 * after a success (`null`) or any other failure.
 */
export function networkStreakAfter(streak: number, code: SyncIssueCode | null): number {
  return code === 'network' ? streak + 1 : 0
}

/**
 * The unsaved activities by cause. `latest` holds the keys the most recent import left, so a count
 * that spans imports can be told from what one import left.
 */
export function countIssues(
  unsynced: ReadonlyMap<string, SyncIssueCode>,
  latest: ReadonlySet<string>,
): SyncIssue[] {
  const counts = new Map<SyncIssueCode, { count: number; latest: number }>()
  for (const [key, code] of unsynced) {
    const entry = counts.get(code) ?? { count: 0, latest: 0 }
    entry.count++
    if (latest.has(key)) entry.latest++
    counts.set(code, entry)
  }
  return [...counts].map(([code, entry]) =>
    entry.latest === entry.count
      ? { code, count: entry.count }
      : { code, count: entry.count, latest: entry.latest },
  )
}
