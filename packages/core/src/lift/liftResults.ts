/**
 * Everything the Lift page and the hero's lift corner render, from one call (docs/design/server-authority.md, L3): the log's
 * state, each estimated lift's history and window counts, the lead lift, the big three with its grades, the corner's grade and
 * the level totals. The page reads these and works out no lift figure of its own. Every function here is the one the page called
 * before (`buildLiftState`, `liftHistory`, `liftChange`, `liftGrade`, `liftCornerGrade`, `liftLevelTotals`, `bigThreeTotal`).
 */
import type { AthleteSettings } from '../athlete'
import type { AgeProfile, LevelBand } from '../grade'
import { liftLevelTotals } from './grade'
import { bigThreeTotal } from './grade/bigThree'
import type { BigThree } from './grade/bigThree'
import { liftCornerGrade, liftGrade } from './grade/liftGrade'
import type { GradedEstimate, LiftCornerGrade, LiftGrade } from './grade/liftGrade'
import { gradedLiftOf } from './grade/liftStandard'
import { LIFTS } from './grade/standard'
import { WINDOW_DAYS } from './constants'
import { liftChange } from './liftChange'
import type { LiftChange } from './liftChange'
import { liftHistory } from './liftHistory'
import type { LiftHistoryPoint } from './liftHistory'
import { buildLiftState } from './liftState'
import type { LiftState, LiftSummary } from './liftState'
import { liftWindowCounts } from './liftWindow'
import type { LiftWindowCounts } from './liftWindow'
import { exerciseKeyOf } from './key'
import type { UnitSystem } from '../units'
import type { ExerciseKey, LiftSet } from './types'

/** The lead lift of the Lift page: its change over the window and its own grade (null for a lift with no graded standard). */
export interface LiftLeadResult {
  key: ExerciseKey
  change: LiftChange | null
  grade: LiftGrade | null
}

export interface LiftResults {
  /** The lift state: one summary per lift (the estimate, floor, bests) and the weekly load. */
  state: LiftState
  /** The local day the window counts and the level totals are as of. */
  today: string
  /** The estimate at each session date, for each lift that has an estimate. */
  histories: Record<ExerciseKey, LiftHistoryPoint[]>
  /** The last eight weeks' sets, sessions and rated sessions, for each lift that has an estimate. */
  windows: Record<ExerciseKey, LiftWindowCounts>
  /** The lift the page leads with when no big three lift is estimated, or none with no estimated lift at all. */
  lead: LiftLeadResult | null
  /** The big three's heaviest estimates and their total. */
  bigThree: BigThree
  /** Each part of `bigThree`'s age grade, in the same order. */
  bigThreeGrades: LiftGrade[]
  /** The hero corner's share-of-total grade. A gap of `no-profile` while the year of birth or sex is missing. */
  corner: LiftCornerGrade
  /** The big three total that earns each level at today's age, in each unit; null where there is no standard. */
  levels: { metric: LevelBand[] | null; imperial: LevelBand[] | null }
}

/** Where a lift stands in the big three's order (squat, bench, deadlift); the others follow. */
function bigThreeRank(summary: LiftSummary): number {
  const graded = gradedLiftOf(summary.exercise, summary.equipment)
  return graded === null ? LIFTS.length : LIFTS.indexOf(graded)
}

/** The most recently trained first; of equal dates the larger estimate, never the name. */
function newerThan(a: LiftSummary, b: LiftSummary): number {
  if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1
  return (b.estimate?.point ?? 0) - (a.estimate?.point ?? 0)
}

/** The lead lift: a big three lift when one has an estimate, else the most recently trained lift with one. */
function leadOf(estimated: readonly LiftSummary[]): LiftSummary | undefined {
  const big = estimated.filter((summary) => bigThreeRank(summary) < LIFTS.length)
  return [...(big.length > 0 ? big : estimated)].sort(newerThan)[0]
}

/** The lift results of a log, as of `today` (a local day, YYYY-MM-DD). Call it in the viewer's zone. */
export function liftResultsOf(
  sets: readonly LiftSet[],
  settings: AthleteSettings,
  today: string,
): LiftResults {
  const state = buildLiftState(sets, settings)
  const profile: AgeProfile | null =
    settings.birthYear === undefined || settings.sex === undefined
      ? null
      : { birthYear: settings.birthYear, sex: settings.sex }
  const estimated = state.lifts.filter((summary) => summary.estimate !== null)
  const ownSets = (key: ExerciseKey) => sets.filter((s) => exerciseKeyOf(s) === key)
  const histories: Record<ExerciseKey, LiftHistoryPoint[]> = {}
  const windows: Record<ExerciseKey, LiftWindowCounts> = {}
  for (const summary of estimated) {
    const own = ownSets(summary.key)
    histories[summary.key] = liftHistory(own)
    windows[summary.key] = liftWindowCounts(own, today)
  }

  const top = leadOf(estimated)
  let lead: LiftLeadResult | null = null
  if (top !== undefined && top.estimate !== null) {
    const graded = gradedLiftOf(top.exercise, top.equipment)
    lead = {
      key: top.key,
      change: liftChange(ownSets(top.key), top.estimate.date, WINDOW_DAYS),
      grade:
        graded === null
          ? null
          : liftGrade({ lift: graded, estimate: top.estimate }, profile, settings),
    }
  }

  const gradedEstimates = estimated.flatMap((summary): GradedEstimate[] => {
    const lift = gradedLiftOf(summary.exercise, summary.equipment)
    return lift === null || summary.estimate === null ? [] : [{ lift, estimate: summary.estimate }]
  })
  const bigThree = bigThreeTotal(gradedEstimates)
  const bands = (units: UnitSystem) =>
    profile === null || settings.massAssumed === true
      ? null
      : liftLevelTotals(profile, today, settings.massKg, units)
  return {
    state,
    today,
    histories,
    windows,
    lead,
    bigThree,
    bigThreeGrades: bigThree.parts.map((part) =>
      liftGrade({ lift: part.lift, estimate: part.estimate }, profile, settings),
    ),
    corner: liftCornerGrade(gradedEstimates, profile, settings),
    levels: { metric: bands('metric'), imperial: bands('imperial') },
  }
}
