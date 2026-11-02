import type { HeldOutActivity } from './sessionLibrary'
import type { ActivitySummary, AnalysisResult } from './digest'
import type { AnswerWindow } from './answer'
import type { Period } from './period'
import type { LateEvidenceBySport } from './digest/lateEvidenceTypes'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import type { TrendPoint } from './digest/trend'
import type { DotsWithheld, EffortLengthS } from './digest/trendPoints'
import type { Curve, SportCurves } from './types'
import type { SyncIssue } from './saveFailure'
import type { EarnedRecord } from './records'
import type { Rejection } from './import/result'
import type { HeartRateJudgement } from './digest/setAsideTypes'
import type { PeriodZoneTimes } from './zones/timeCache'
import type { ZoneEstimates } from './zones'
import type { FitnessBySport } from './fitness/types'
import type { LookBack } from './lookback/compute'
import type { History } from './history/compute'
import type { ChangeEvidence, EarlierComparison } from './change/types'

/** An activity file this import could not use, with why. */
export interface RejectedFile extends Rejection {
  fileName: string
}

/** The bests of the whole library that a sport page reads when its period holds too few activities of a sport to judge them. */
export interface LibraryBests {
  /** A run's best curve, in metabolic W/kg. */
  run: Curve
  /** A ride's best curve in measured watts. */
  ride: Curve
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
   * Saved activities the athlete labelled something other than a run or a ride (Hike, Walk, a ski, a workout), left out
   * of the analysis. Disjoint from `walkingPaceRuns`: an activity with both is counted here only. Absent when none.
   */
  labelledRuns?: number
  /**
   * The workout keys (see `workoutKey`) of the runs at walking pace that the athlete counts as runs
   * (`AthleteSettings.countedRuns`). They are in the analysis and carry no mark in the library.
   */
  countedWalkingRuns: string[]
  /** The period analysed: its choice and its dates. The library lists every activity regardless. */
  period: Period
  /**
   * The window the period stands on, and why. The default choice is searched for the shortest of 12 weeks, 26 weeks and
   * 12 months where every sport the athlete does has a best 20 min not shown easy, else all time (`resolveWindow`); its
   * `passed` windows say what the shorter ones lacked. Any other choice is its own window, `asked`.
   */
  answerWindow: AnswerWindow
  /** Every visible activity, newest first, whatever the period: the activity list and its pages. */
  library: ActivitySummary[]
  /** Activities the sink could not save, by cause, until they are saved or the library is cleared. */
  syncIssues: SyncIssue[]
  /**
   * Weekly best 20-minute values over the selected period, or over the whole library for all time.
   * Each value is the best in a trailing window that ends that week and lies inside the period.
   */
  trend: readonly TrendPoint[]
  /**
   * The best curves of the whole library, whatever the period, for a period that holds fewer than
   * PROFILE_FULL_LEVEL_ACTIVITIES activities of some sport. Null for all time, whose `result` holds them, when no sport is short,
   * and without an analysis.
   */
  libraryBests: LibraryBests | null
  /** The same weekly trend for each effort length, of which `trend` is the 20-minute one. */
  effortTrends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** The effort lengths whose dots the effort gate left too few to draw, that the period has without it: their empty state names the gate. */
  dotsWithheld: DotsWithheld
  /** Each sport's output at one heart rate, week by week over the period: the heart rate the fitness card names. */
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
   * holding, recovering, back, or not enough evidence yet, with the figures and runs behind it. Its onset and low are
   * dated by the look-back's episode where the look-back lists it (lookback/cardDates.ts).
   */
  fitness: FitnessBySport
  /**
   * Each sport's years told in hindsight, through twelve weeks before the newest activity, and its bests over the years:
   * library-wide whatever period is picked, and small however long the library (no list past its cap).
   */
  lookBack: LookBack
  /**
   * The charts of the History page, one entry for each part in history/parts.ts: built from every analysed activity,
   * whatever period is picked, and remembered for the same digests.
   */
  history: History
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
  /**
   * The window the What changed strip compares with when the period before holds too few efforts to test: the latest
   * earlier window of the same length where the change test can be made (`earlierComparison`), with its curves and test.
   * Null when the period before is enough, and for all time. `previous` and `change` stay the period before's.
   */
  earlier: EarlierComparison | null
  /** The best efforts each activity holds across the whole library, not the period. */
  records: Map<string, EarnedRecord[]>
}
