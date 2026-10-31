import type { ReactNode } from 'react'
import type { ChangeEvidence } from '@rca/core/change/types'
import type { LateEvidence, SameHeartRate, SportCurves, TrendPoint } from '@rca/core/digest'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { FitnessBySport } from '@rca/core/fitness'
import type { LookBack } from '@rca/core/lookback'
import type { MeasureTime } from '@rca/core/zones'
import type { UnitSystem } from '@rca/core/units'
import type { LeftOutRuns } from '../analysis/walkingPaceCopy'
import type { AgeGap, AgeProfile } from '../grades'

/** What a sport page is given: one sport's analysis, its period and the settings its figures need. */
export interface SportPageProps {
  sport: Sport
  result: AnalysisResult
  /** The best efforts of the period before the selected one, or null for all time. */
  previous: SportCurves | null
  /** The label of that period, such as "Previous 6 weeks". */
  previousLabel: string | null
  /** Whether each best effort differs from that period's by more than chance; null for all time. */
  change: ChangeEvidence | null
  /** The weekly trend of each effort length over the period. */
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** This sport's output at one heart rate, week by week over the period. */
  sameHeartRate: SameHeartRate
  /** Each sport's fitness at the same heart rate over the whole library, whatever the period: the page leads with its own sport's. */
  fitness?: FitnessBySport
  /** Each sport's years in hindsight, whatever the period: the page's "Your years" section reads its own sport's. */
  lookBack?: LookBack
  /** This sport's best efforts late in long sessions, and the drift of its steady efforts, over the period. */
  lateEvidence: LateEvidence
  /** This sport's time in each zone over the period, one row for each measure. Absent: none counted. */
  zoneTimes?: readonly MeasureTime[]
  /** The same over the period before it, or null for all time or when it holds no activities. */
  previousZoneTimes?: readonly MeasureTime[] | null
  units: UnitSystem
  massKg: number
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The year of birth or sex the grades still need, which the note names; null when both are given. */
  missingAge: AgeGap | null
  /** The window in days, or null for all time: the figures' scope is named by it. */
  rangeDays: number | null
  /** The period control, shown under the answer it changes. */
  controls: ReactNode
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
  /** What to say when the sport has nothing in the period, naming the period. */
  emptyText: string
  /** Set when every activity of the sport is at walking pace and left out: the empty page offers to count them. */
  leftOut?: LeftOutRuns
  /**
   * How many of the sport's activities the library holds, in all time. With none, the page has no period
   * to pick and asks for files; with some and none in the period, it offers All time.
   */
  inLibrary: number
  /**
   * Every visible activity, whatever the period. The period before's activities are not in the result,
   * so the power source of an earlier best is looked up here.
   */
  library: ActivitySummary[]
  /** Shows every activity, from the All time action an empty period offers. */
  onShowAll?: () => void
  /** Adds files, from the action an empty sport page offers. */
  onAddFiles: (files: File[]) => void
}

/** What each section of a sport page is given: the page's props, and what the page worked out once. */
export interface SectionContext extends SportPageProps {
  /** How many of the sport's activities the period holds. */
  count: number
  /**
   * The time the page was opened at: a record's age counts from it, and a year shows only when the last run
   * is from an earlier year. Read once, so a later render does not move either.
   */
  openedAt: number
}
