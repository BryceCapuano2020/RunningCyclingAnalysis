import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { windowEnding } from '@rca/core/period'
import { predictRunRaces, typicalWeeklyDistance, vdotOf } from '@rca/core/predict'
import type { RunPredictions } from '@rca/core/predict'
import type { Sport } from '@rca/core/types'
import { WIDENED_YEAR_DAYS } from '@rca/core/zones'
import { RUN_RACE_DISTANCES_M } from '@rca/core/constants'
import { RACE_PREDICTORS, libraryJudge, periodJudge, runBests } from './racePredictions'
import type { RunBest, RunJudge } from './racePredictions'

/** The sport the running predictor reads. */
const RUN: Sport = 'run'

/** The stretch of the library a card rests on: the period, the 12 months ending with it, or (a period of all time) all time. */
export type RaceWindow = 'period' | 'year' | 'all'

/** The run a card rests on: its best from the mile up with the highest VDOT, and the day it was run. */
export interface RaceBasis {
  distanceM: number
  startMs: number
}

/** A forecast: times carried from a run to each race distance. */
export interface RaceForecast {
  /** `bound`: no run of the window was shown hard, so each time is one the athlete is no slower than. */
  kind: 'predicted' | 'bound'
  found: RunPredictions
  window: RaceWindow
  /** The run the times were carried from; null when they rest on heart rate alone. */
  basis: RaceBasis | null
  /** The window's activities, whose recorded bests sit beside the rows. */
  activities: ActivitySummary[]
}

/** A run at a distance, as it was run. */
export interface PastRun {
  distanceM: number
  seconds: number
  startMs: number
}

/**
 * Runs older than 12 months before the period's end, which are all there is: told as they were run, with no forecast
 * from them, since a run that old says nothing of the athlete now.
 */
export interface RacePast {
  kind: 'past'
  /** Each race distance the athlete ran, as it was run; with none of those, the run with the best VDOT. */
  ran: PastRun[]
}

/** What the race predictions rest on and how far it reaches. */
export type RaceAnswer = RaceForecast | RacePast

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

/** The sport's runs. */
const runsOf = (list: readonly ActivitySummary[]) => list.filter((a) => a.sport === RUN)

/** The windows a forecast is tried on, narrowest first: the period, then (for a period shorter than all time) the 12 months ending with it. */
function candidates(result: AnalysisResult, reach: RaceReach | null, yearStartMs: number | null) {
  const period: Candidate = {
    window: 'period',
    activities: runsOf(result.activities),
    judge: periodJudge(result),
    vo2max: result.runVo2max,
  }
  if (reach === null || reach.endMs === null || yearStartMs === null) return [period]
  const endMs = reach.endMs
  return [
    period,
    {
      window: 'year' as const,
      activities: runsOf(reach.library).filter(
        (run) => run.startMs >= yearStartMs && run.startMs <= endMs,
      ),
      judge: libraryJudge(reach.judgement),
      vo2max: null,
    },
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

/** What the runs older than the year ran at each race distance, or at their best distance when they ran none of them. */
function pastRuns(entries: readonly RunBest[]): PastRun[] {
  const fastest = new Map<number, RunBest>()
  for (const entry of entries) {
    const held = fastest.get(entry.best.distanceM)
    if (held === undefined || entry.best.seconds < held.best.seconds) {
      fastest.set(entry.best.distanceM, entry)
    }
  }
  const of = ({ best, run }: RunBest): PastRun => ({
    distanceM: best.distanceM,
    seconds: best.seconds,
    startMs: run.startMs,
  })
  const races = RUN_RACE_DISTANCES_M.flatMap((distanceM) => {
    const entry = fastest.get(distanceM)
    return entry === undefined ? [] : [of(entry)]
  })
  if (races.length > 0) return races
  const basis = basisOf(entries)
  const own = basis === null ? undefined : fastest.get(basis.distanceM)
  return own === undefined ? [] : [of(own)]
}

/**
 * The race predictions the library can give, from the narrowest window that gives them: the period, then the 12 months
 * ending with it. A window answers when a run of it was shown hard (or the period's heart rate gives a VO2max), and its
 * prediction rests on those runs. When no window holds a hard run, the first window with a run of a mile or more answers
 * with a bound: its bests carried as they are, each time one the athlete is no slower than. When neither window holds any run
 * of a mile or more, the runs older than 12 months before the period's end are told as they were run (`RacePast`), with no
 * forecast from them. A period of all time is its own window and widens no further. Null only when the library holds no run
 * of a mile or more and the period's heart rate gives none.
 */
export function raceAnswerOf(
  sport: Sport,
  result: AnalysisResult,
  rangeDays: number | null,
  reach?: RaceReach,
): RaceAnswer | null {
  if (RACE_PREDICTORS[sport] === undefined) return null
  const widening = rangeDays !== null && reach !== undefined && reach.endMs !== null ? reach : null
  const yearStartMs =
    widening === null ? null : windowEnding(widening.endMs!, WIDENED_YEAR_DAYS).startMs
  // Each candidate is made here, so it takes its bests in place.
  const tried = candidates(result, widening, yearStartMs).map((candidate) =>
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
      return { kind: 'predicted', found, window, basis: basisOf(candidate.kept), activities }
    }
  }
  for (const candidate of tried) {
    if (candidate.all.length === 0) continue
    const found = predict(candidate, candidate.all, null)
    if (found.races.length > 0) {
      const { window, activities } = candidate
      return { kind: 'bound', found, window, basis: basisOf(candidate.all), activities }
    }
  }
  if (widening === null || yearStartMs === null) return null
  const older = runsOf(widening.library).filter((run) => run.startMs < yearStartMs)
  const ran = pastRuns(runBests(older, libraryJudge(widening.judgement)).all)
  return ran.length === 0 ? null : { kind: 'past', ran }
}
