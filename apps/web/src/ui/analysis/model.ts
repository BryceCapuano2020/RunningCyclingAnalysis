import type { Dispatch, SetStateAction } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { WorkerRequest, WorkerResponse } from '../../worker/protocol'
import type { AccountController } from '../useAccount'

/** 'loaded' is the only state in which an import may be sent to the signed-in library. */
export type LibraryStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export type Account = Pick<AccountController, 'status' | 'me'> &
  Partial<
    Pick<AccountController, 'flushProfileWrites' | 'markExpired' | 'refresh' | 'sessionExpired'>
  >

/** A ref shared by the pieces of useAnalysis. The hook that creates it sets the first value. */
export interface Box<T> {
  current: T
}

export type Setter<T> = Dispatch<SetStateAction<T>>

export type SetError = (
  message: string | null,
  issue?: SyncIssueCode | null,
  neutral?: boolean,
) => void

/** The files an import has read, and how many it holds in all when that is known before reading. */
export interface ImportProgress {
  filesRead: number
  /** Null when the total is not known, such as for a zip that holds another zip. */
  filesTotal: number | null
  /** Set while a rate limit holds the saves back. The next progress message ends it. */
  paused?: true
}

export interface ErrorNotice {
  message: string
  issue: SyncIssueCode | null
  /** A message the visitor asked for, such as a stop: shown as news, never as a fault. */
  neutral?: boolean
}

/** A deletion from the account library or from the library kept in this browser. */
export function isDeletion(kind: WorkerRequest['type']): boolean {
  return kind === 'deleteActivity' || kind === 'deleteDeviceActivity'
}

/** A request the worker has not answered yet. `notice` is the confirmation shown on success. */
export interface Pending {
  kind: WorkerRequest['type']
  notice?: string
  /** The analysis an import is compared with, taken when the import was sent. */
  baseline?: AnalysisResult | null
  /** Receives the worker's answer, or null when the worker is dropped before answering. */
  settle?: (message: WorkerResponse | null) => void
  /** An analysis made while the account loads: its answer is not an import result, so it is not summarised. */
  provisional?: boolean
  /** An import whose digests the worker keeps on this device. */
  saveToDevice?: boolean
  /** Set when the session was cleared after the request was sent: its answer is dropped. */
  ignored?: boolean
  /** The session the request was made in (WorkerTransport.sessionEpochRef). A library read from an earlier one is overtaken. */
  session?: number
  /** A clear that also empties the library kept in this browser. */
  forgetDevice?: boolean
}

/** Empties a queue of file batches and returns them, in the order they were queued. */
export function drainBatches(queue: Box<File[][]>): File[][] {
  const batches = queue.current
  queue.current = []
  return batches
}

/** The period before any activities are loaded: the default, with no dates yet. */
export const EMPTY_PERIOD: Period = {
  choice: 'default',
  startMs: null,
  endMs: null,
  days: null,
  fellBack: false,
}

export const EMPTY_SESSION: SessionState = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  period: EMPTY_PERIOD,
  library: [],
  syncIssues: [],
  outdatedActivities: 0,
  incompatibleActivities: 0,
  hiddenDuplicates: 0,
  trend: [],
  previous: null,
  effortTrends: NO_TRENDS,
  sameHeartRate: NO_SAME_HEART_RATE,
  lateEvidence: NO_LATE_EVIDENCE,
  records: new Map(),
}
