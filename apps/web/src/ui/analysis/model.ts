import { NO_WINDOW } from '@rca/core/answer'
import type { Dispatch, SetStateAction } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NONE_WITHHELD, NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { NO_HISTORY } from '@rca/core/history'
import { NO_ZONE_TIMES } from '@rca/core/zones'
import type { WorkerRequest, WorkerResponse } from '../../worker/protocol'
import type { AccountController } from '../useAccount'

/** 'loaded' is the only state in which an import may be sent to the signed-in library. */
export type LibraryStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export type Account = Pick<AccountController, 'status' | 'me'> &
  Partial<
    Pick<
      AccountController,
      'flushProfileWrites' | 'markExpired' | 'refresh' | 'sessionExpired' | 'lookupPending'
    >
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

/**
 * Whether it is still unknown who is signed in: the account is loading, or it could not be reached
 * and the lookup will be tried again. Files are analysed in this session only, and nothing is kept
 * on this device, until it is known.
 */
export function accountPending(account: Pick<Account, 'status' | 'lookupPending'>): boolean {
  return (
    account.status === 'loading' || (account.status === 'unavailable' && !!account.lookupPending)
  )
}

/** A deletion from the account library or from the library kept in this browser. */
export function isDeletion(kind: WorkerRequest['type']): boolean {
  return kind === 'deleteActivity' || kind === 'deleteDeviceActivity'
}

/** A request the worker has not answered yet. `notice` is the confirmation shown on success. */
export interface Pending {
  /** The request's number, which its reply carries back as `replyTo`. Unique for the page's life. */
  id: number
  kind: WorkerRequest['type']
  /** When the request was sent, in epoch ms. */
  sentAt: number
  /** When the worker began it, in epoch ms; absent while it waits its turn behind another request. */
  startedAt?: number
  /** A read of a route or recording from the kept original file, which can take a download's time. */
  fromOriginal?: boolean
  /** The worker's last work count for this request, and when it last moved (or the request last spoke). */
  progress?: number
  activeAt?: number
  notice?: string
  /** The analysis an import is compared with, taken when the import was sent. */
  baseline?: Baseline | null
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

/**
 * The analysis an import is compared with, and the period it was made under. A period is a regime: the default period
 * is 12 weeks, or all time where the last 12 weeks lack a sport the library has, so one added activity can switch it, and figures from
 * two regimes are not figures of one athlete changing.
 */
export interface Baseline {
  result: AnalysisResult
  period: Period
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
  libraryActivities: 0,
  heldOut: [],
  hiddenDuplicates: 0,
  answerWindow: NO_WINDOW,
  walkingPaceRuns: 0,
  countedWalkingRuns: [],
  trend: [],
  previous: null,
  change: null,
  effortTrends: NO_TRENDS,
  dotsWithheld: NONE_WITHHELD,
  sameHeartRate: NO_SAME_HEART_RATE,
  lateEvidence: NO_LATE_EVIDENCE,
  heartRateJudgement: NO_HEART_RATE_JUDGEMENT,
  fitness: NO_FITNESS,
  lookBack: NO_LOOKBACK,
  history: NO_HISTORY,
  zoneEstimates: null,
  timeInZones: NO_ZONE_TIMES,
  records: new Map(),
}

/** What this browser kept from before sign-in that the account could take, as the worker counted it. */
export interface DeviceOfferStatus {
  /** Can be added: the file's hash is kept and the analysis is current. */
  adoptable: number
  /** Need their files added again (no hash kept, or an older analysis). */
  again: number
  /** The account holds these workouts already. */
  held: number
}

/** How adding those activities to the account ended. `failed` and `conflicts` stay kept in this browser. */
export interface AdoptionOutcome {
  saved: number
  /** The account holds another file for the same workout. */
  conflicts: number
  failed: number
  again: number
  held: number
}

/** How the saves an earlier visit left behind are going, and how they ended. */
export interface OutboxStatus {
  /** Still waiting to be saved. */
  pending: number
  saved: number
  /** Could not be saved and will not be tried again. */
  failed: number
  finished: boolean
}

/** Which activities this browser holds detailed readings for, and when the oldest of them started. */
export interface DetailCoverage {
  ids: ReadonlySet<string>
  oldestStartMs: number | null
}
