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
  /** The import stopped because the account ended or changed. Sent before its state. */
  | { type: 'accountIssue'; issue: SyncIssueCode }
  | { type: 'state'; state: SessionState; outcome?: ImportOutcome }
  | {
      type: 'rebuildComplete'
      state: SessionState
      rebuilt: number
      missing: number
      failed: number
    }
  /** `issue` is set when the failure means the account ended or changed, so the app can act on it. */
  | { type: 'error'; message: string; issue?: SyncIssueCode }
