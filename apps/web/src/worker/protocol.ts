import type { SessionState, SyncIssueCode } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'

export interface SavedActivity {
  id: string
  name: string
  startMs: number
  sport: 'run' | 'ride'
}

export interface ImportOutcome {
  activities: number
  rejected: number
}

/** Whether imported activities are saved to the signed-in account, and whether their files are kept. */
export interface SyncOptions {
  userId: string
  keepFiles: boolean
}

export type WorkerRequest =
  | { type: 'addFiles'; files: File[]; settings: AthleteSettings; sync: SyncOptions | null }
  | { type: 'loadSample'; settings: AthleteSettings }
  | { type: 'loadServer'; settings: AthleteSettings; userId: string }
  | { type: 'rebuildStale'; settings: AthleteSettings; userId: string }
  | { type: 'setSettings'; settings: AthleteSettings }
  | { type: 'setRange'; rangeDays: number | null; settings: AthleteSettings }
  | { type: 'clear' }
  | { type: 'deleteActivity'; id: string; userId: string; settings: AthleteSettings }

export type WorkerResponse =
  | { type: 'progress'; filesRead: number; uploaded?: number }
  /** Saved activities without an original file. Sent before the state that ends the request. */
  | { type: 'missingOriginals'; count: number }
  | { type: 'libraryActivities'; activities: SavedActivity[] }
  /** Stored activities the server could not read in the last library load, sent when above zero. */
  | { type: 'libraryUnreadable'; count: number }
  /** The import stopped because the account ended or changed. Sent before its state. */
  | { type: 'accountIssue'; issue: SyncIssueCode }
  | { type: 'state'; state: SessionState; outcome?: ImportOutcome }
  | {
      type: 'rebuildComplete'
      state: SessionState
      rebuilt: number
      missing: number
      failed: number
      /** Stale activities skipped at a daily or rate limit; try again after the limit resets. */
      limited: number
      /** Which limit stopped the rebuild: the daily download limit wins over a plain rate limit. */
      limitKind: 'daily' | 'rate' | null
      /** When the limit resets, in epoch ms; null when no limit was reached. */
      limitResetsAtMs: number | null
    }
  /** `issue` is set when the failure means the account ended or changed, so the app can act on it. */
  | { type: 'error'; message: string; issue?: SyncIssueCode }
