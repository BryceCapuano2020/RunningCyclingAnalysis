import type { SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'

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

export type WorkerResponse =
  | { type: 'progress'; filesRead: number; uploaded?: number }
  | { type: 'state'; state: SessionState }
  | {
      type: 'rebuildComplete'
      state: SessionState
      rebuilt: number
      missing: number
      failed: number
    }
  | { type: 'error'; message: string }
