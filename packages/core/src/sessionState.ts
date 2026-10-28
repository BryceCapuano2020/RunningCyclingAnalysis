import type { ActivitySummary, AnalysisResult } from './digest'
import type { Period } from './period'
import type { LateEvidenceBySport } from './digest/lateEvidenceTypes'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import type { TrendPoint } from './digest/trend'
import type { EffortLengthS } from './digest/trendPoints'
import type { SportCurves } from './types'
import type { SyncIssue } from './saveFailure'
import type { EarnedRecord } from './records'
import type { Rejection } from './import/result'

/** An activity file this import could not use, with why. */
export interface RejectedFile extends Rejection {
  fileName: string
}

export interface SessionState {
  /** Null until at least one activity has been loaded. */
  result: AnalysisResult | null
  /** The files the last import could not use. */
  rejected: RejectedFile[]
  /** Activity files in formats this app does not read (e.g. KML) that the last import skipped. */
  unsupportedFiles: number
  isSample: boolean
  /** Activities analysed or eligible, not counting hidden duplicates, before the period filter. */
  totalActivities: number
  /** Stored activities excluded because their digest model is older than this app's. */
  outdatedActivities: number
  /** Stored activities excluded because their digest model is from a newer app version. */
  incompatibleActivities: number
  /**
   * Saved activities left out of the analysis because a copy of the same workout in a higher format
   * (FIT over TCX over GPX) is saved too. They stay in the library.
   */
  hiddenDuplicates: number
  /** The period analysed: its choice and its dates. The library lists every activity regardless. */
  period: Period
  /** Every visible activity, newest first, whatever the period: the activity list and its pages. */
  library: ActivitySummary[]
  /** Activities the sink could not save, by cause, until they are saved or the library is cleared. */
  syncIssues: SyncIssue[]
  /**
   * Weekly best 20-minute values over the selected period, or over the whole library for all time.
   * Each value is the best in a trailing window that ends that week and lies inside the period.
   */
  trend: readonly TrendPoint[]
  /** The same weekly trend for each effort length, of which `trend` is the 20-minute one. */
  effortTrends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** Each sport's output at one heart rate, week by week over the period. */
  sameHeartRate: SameHeartRateBySport
  /** Each sport's best efforts late in long sessions, and the drift of its steady efforts, over the period. */
  lateEvidence: LateEvidenceBySport
  /**
   * The best run and ride curves of the period before the selected one, of the same length. Null for
   * all time, or when that period has no activities.
   */
  previous: SportCurves | null
  /** The best efforts each activity holds across the whole library, not the period. */
  records: Map<string, EarnedRecord[]>
}
