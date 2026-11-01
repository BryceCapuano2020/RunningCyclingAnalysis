import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { windowEnding } from '@rca/core/period'
import { predictRunRaces, typicalWeeklyDistance, vdotOf } from '@rca/core/predict'
import type { RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { WIDENED_YEAR_DAYS } from '@rca/core/zones'
import { RACE_PREDICTORS, libraryJudge, periodJudge, runBests } from './racePredictions'
import type { RunBest, RunJudge } from './racePredictions'

/** The sport the running predictor reads. */
const RUN: Sport = 'run'

/** The stretch of the library a card rests on: the period, the 12 months ending with it, or all time. */
export type RaceWindow = 'period' | 'year' | 'all'

/** The run a card rests on: its best from the mile up with the highest VDOT, and the day it was run. */
export interface RaceBasis {
  distanceM: number
  startMs: number
}

/** What the race predictions rest on and how far it reaches. */
export interface RaceAnswer {
  found: RunPredictions
  window: RaceWindow
  /** No run of the window was shown hard, so each time is one the athlete is no slower than. */
  bound: boolean
  /** The run the times were carried from; null when they rest on heart rate alone. */
  basis: RaceBasis | null
  /** The window's activities, whose recorded bests sit beside the rows. */
  activities: ActivitySummary[]
}

/** What widens the period: the library's judgement and the activities it holds, and where the period ends. */
export interface RaceReach {
  judgement: HeartRateJudgement
  library: readonly ActivitySummary[]
  /** The end of the period, ms; null for an empty library. */
  endMs: number | null
}

interface Candidate {
  window: RaceWindow
  activities: ActivitySummary[]
  judge: RunJudge
  /** VO2max from heart rate, which only the period's own hard outdoor runs give. */
  vo2max: AnalysisResult['runVo2max']
}

/** The windows to try, narrowest first: the period, then (for a period shorter than all time) 12 months and all time. */
function candidates(result: AnalysisResult, rangeDays: number | null, reach?: RaceReach) {
  const runs = (list: readonly ActivitySummary[]) => list.filter((a) => a.sport === RUN)
  const period: Candidate = {
    window: 'period',
    activities: runs(result.activities),
    judge: periodJudge(result),
    vo2max: result.runVo2max,
  }
  if (rangeDays === null || reach === undefined || reach.endMs === null) return [period]
  const judge = libraryJudge(reach.judgement)
  const { startMs } = windowEnding(reach.endMs, WIDENED_YEAR_DAYS)
  const all = runs(reach.library)
  return [
    period,
    {
      window: 'year' as const,
      activities: all.filter((run) => run.startMs >= startMs && run.startMs <= reach.endMs!),
      judge,
      vo2max: null,
    },
    { window: 'all' as const, activities: all, judge, vo2max: null },
  ]
}

/** The best with the highest VDOT among those a card is carried from, the latest of equals; null with none. */
function basisOf(entries: readonly RunBest[]): RaceBasis | null {
  let top: { entry: RunBest; vdot: number } | null = null
  for (const entry of entries) {
    const vdot = vdotOf(entry.best.distanceM, entry.best.seconds)
    if (
      top === null ||
      vdot > top.vdot ||
      (vdot === top.vdot && entry.run.startMs > top.entry.run.startMs)
    ) {
      top = { entry, vdot }
    }
  }
  return top === null
    ? null
    : { distanceM: top.entry.best.distanceM, startMs: top.entry.run.startMs }
}

/**
 * The race predictions the library can give, from the narrowest window that gives them: the period, then the 12 months
 * ending with it, then all time. A window answers when a run of it was shown hard (or the period's heart rate gives a VO2max),
 * and its prediction rests on those runs. When no window holds a hard run, the first window with a run of a mile or more
 * answers with a bound: its bests carried as they are, each time one the athlete is no slower than. Null only when the
 * library holds no run of a mile or more and the period's heart rate gives none.
 */
export function raceAnswerOf(
  sport: Sport,
  result: AnalysisResult,
  rangeDays: number | null,
  reach?: RaceReach,
): RaceAnswer | null {
  if (RACE_PREDICTORS[sport] === undefined) return null
  // Each candidate is made here, so it takes its bests in place.
  const tried = candidates(result, rangeDays, reach).map((candidate) =>
    Object.assign(candidate, runBests(candidate.activities, candidate.judge)),
  )
  const predict = (
    candidate: (typeof tried)[number],
    entries: readonly RunBest[],
    vo2max: Candidate['vo2max'],
  ) =>
    predictRunRaces({
      bests: entries.map(({ best }) => best),
      vo2max,
      weeklyM: typicalWeeklyDistance(candidate.activities),
    })
  for (const candidate of tried) {
    const found = predict(candidate, candidate.kept, candidate.vo2max)
    if (found.races.length > 0) {
      const { window, activities } = candidate
      return { found, window, bound: false, basis: basisOf(candidate.kept), activities }
    }
  }
  for (const candidate of tried) {
    if (candidate.all.length === 0) continue
    const found = predict(candidate, candidate.all, null)
    if (found.races.length > 0) {
      const { window, activities } = candidate
      return { found, window, bound: true, basis: basisOf(candidate.all), activities }
    }
  }
  return null
}
