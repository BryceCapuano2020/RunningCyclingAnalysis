import type { HeldOutActivity } from './sessionLibrary'
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
import type { HeartRateJudgement } from './digest/setAsideTypes'
import type { PeriodZoneTimes } from './zones/timeCache'
import type { ZoneEstimates } from './zones'
import type { FitnessBySport } from './fitness/types'
import type { ChangeEvidence } from './change/types'

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
  /** Every activity the library holds, whatever the model that made its digest: the read, the held out and the newer. */
  libraryActivities: number
  /** The activities held out of the analysis (stale or newer), by identity, newest first. The library lists them. */
  heldOut: HeldOutActivity[]
  /**
   * Saved activities left out of the analysis because a copy of the same workout in a higher format
   * (FIT over TCX over GPX) is saved too. They stay in the library.
   */
  hiddenDuplicates: number
  /**
   * Saved runs at walking pace, hikes recorded as runs (see WALKING_PACE), left out of the analysis. They stay
   * in the library, marked.
   */
  walkingPaceRuns: number
  /**
   * The workout keys (see `workoutKey`) of the runs at walking pace that the athlete counts as runs
   * (`AthleteSettings.countedRuns`). They are in the analysis and carry no mark in the library.
   */
  countedWalkingRuns: string[]
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
   * Whose heart rate is set aside, judged once over every visible activity whatever the period, with the reference
   * heart rates and thresholds it was judged against. A period's analysis takes this list for its own activities.
   */
  heartRateJudgement: HeartRateJudgement
  /**
   * Each sport's fitness at the same effort over the whole library, whatever period is picked: slipping,
   * holding, recovering, back, or not enough evidence yet, with the figures and runs behind it.
   */
  fitness: FitnessBySport
  /**
   * The references that estimated zones are cut from: the thresholds and reference heart rates of the whole
   * library, whatever period is picked, so an activity has the same zones everywhere. Null without an analysis.
   */
  zoneEstimates: ZoneEstimates | null
  /** Each sport's time in zones over the period, and over the one before it. See periodTimeInZones. */
  timeInZones: PeriodZoneTimes
  /**
   * The best run and ride curves of the period before the selected one, of the same length. Null for
   * all time, or when that period has no activities.
   */
  previous: SportCurves | null
  /**
   * Whether each best effort of the selected period differs from the previous period's by more than chance, for
   * both sports at every curve duration (see changeEvidence). Null where `previous` is.
   */
  change: ChangeEvidence | null
  /** The best efforts each activity holds across the whole library, not the period. */
  records: Map<string, EarnedRecord[]>
}
