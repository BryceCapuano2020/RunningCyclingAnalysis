import type { AnalysisResult } from './digest'
import type { TrendPoint } from './digest/trend'
import type { EffortLengthS } from './digest/trendPoints'
import type { SportCurves } from './types'
import type { SyncIssue } from './saveFailure'
import type { EarnedRecord } from './records'

export interface RejectedFile {
  fileName: string
  reason: string
}

export interface SessionState {
  /** Null until at least one activity has been loaded. */
  result: AnalysisResult | null
  rejected: RejectedFile[]
  /** Activity files in formats this app does not read (e.g. KML) that were skipped. */
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
  /** Only activities from the last rangeDays days before the newest one are analysed; null = all. */
  rangeDays: number | null
  /** Activities the sink could not save, by cause, until they are saved or the library is cleared. */
  syncIssues: SyncIssue[]
  /**
   * Weekly best 20-minute values over the selected period, or over the whole library for all time.
   * Each value is the best in a trailing window that ends that week and lies inside the period.
   */
  trend: readonly TrendPoint[]
  /** The same weekly trend for each effort length, of which `trend` is the 20-minute one. */
  effortTrends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /**
   * The best run and ride curves of the period before the selected one, of the same length. Null for
   * all time, or when that period has no activities.
   */
  previous: SportCurves | null
  /** The best efforts each activity holds across the whole library, not the period. */
  records: Map<string, EarnedRecord[]>
}
