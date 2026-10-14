import type { SessionState } from '../core/session'
import type { AthleteSettings } from '../core/types'

export type WorkerRequest =
  | { type: 'addFiles'; files: File[]; settings: AthleteSettings }
  | { type: 'loadSample'; settings: AthleteSettings }
  | { type: 'setSettings'; settings: AthleteSettings }
  | { type: 'setRange'; rangeDays: number | null; settings: AthleteSettings }
  | { type: 'clear' }

export type WorkerResponse =
  | { type: 'progress'; filesRead: number }
  | { type: 'state'; state: SessionState }
  | { type: 'error'; message: string }
