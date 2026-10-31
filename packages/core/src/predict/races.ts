import { MARATHON_M, RACE_LOG_SD, RACE_RANGE_Z, RUN_RACE_DISTANCES_M } from '../constants'
import { danielsTime, vdotOf } from './daniels'
import { marathonTime } from './marathon'
import { riegelTime, type Performance } from './riegel'
import type { Vo2maxEstimate } from './vo2max'

type RaceM = (typeof RUN_RACE_DISTANCES_M)[number]

/**
 * How a race time was predicted. Running has two methods, read the way the two common predictors read:
 * an app's, from the races and hard efforts already run, and a watch's, from a VO2max worked out of
 * heart rate against pace. A sport with races names its own.
 */
export type PredictionMethod = 'performances' | 'heartRate'

export interface MethodTime {
  method: PredictionMethod
  seconds: number
  /** The distance, m, of the nearest best (or, for heart rate, the race at its VO2max) it was carried from. */
  fromM: number
}

/** A predicted race, by its distance. The shape holds for any sport with set distances. */
export interface RacePrediction {
  distanceM: number
  /**
   * The predicted time, s: the geometric mean of the methods that could judge the race, and never slower than the
   * runner's own best at this distance among the bests it was worked out from (a run already done is a floor).
   */
  seconds: number
  /** The 10th to 90th percentile of likely times, s, from published errors and the methods' disagreement. */
  low: number
  high: number
  /** Whether the time was moved onto the athlete's own best at this distance, which it would otherwise be slower than. */
  floored: boolean
  /** Each method's own time, performances first. */
  methods: MethodTime[]
}

/** The running predictions, with what each method rests on. */
export interface RunPredictions {
  races: RacePrediction[]
  /** The best VDOT the runner's bests imply, the VO2max-like figure their running shows; null without bests. */
  runsVdot: number | null
  /** VO2max from heart rate against pace, or null. */
  vo2max: Vo2maxEstimate | null
}

/** What a running prediction is worked out from. */
export interface RunPredictionInput {
  /** The best time at each record distance in the period, from the mile up. */
  bests: readonly Performance[]
  /** VO2max from heart rate, or null without enough heart rate. */
  vo2max: Vo2maxEstimate | null
  /** The runner's typical weekly running distance, m, for the marathon's training-volume correction. */
  weeklyM: number
}

/**
 * One method's time for a race from its anchor performances: Riegel at 1.07 up to the half marathon, and
 * Vickers & Vertosick's mileage-corrected model for the marathon.
 */
function timeFrom(anchors: readonly Performance[], distanceM: RaceM, weeklyM: number) {
  return distanceM === MARATHON_M ? marathonTime(anchors, weeklyM) : riegelTime(anchors, distanceM)
}

/** The races a VO2max would run by Daniels and Gilbert's formula, as anchors to carry like real bests. */
function heartRateAnchors(vo2max: Vo2maxEstimate): Performance[] {
  return [5_000, 10_000].map((distanceM) => ({
    distanceM,
    seconds: danielsTime(distanceM, vo2max.vo2max),
  }))
}

/**
 * The prediction from the methods' times: their geometric mean, and a range whose spread combines the
 * race's published error with half the methods' log disagreement, since both are uncertainty. Where the runner
 * has already run the race's distance faster (`demonstrated`, s), a mean slower than that is moved onto it, the
 * range with it: a time already run is not one to predict beyond.
 */
function predictionOf(
  distanceM: RaceM,
  methods: MethodTime[],
  demonstrated: number | null,
): RacePrediction {
  const logs = methods.map((m) => Math.log(m.seconds))
  const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length
  const disagreement = (Math.max(...logs) - Math.min(...logs)) / 2
  const sd = Math.hypot(RACE_LOG_SD[distanceM], disagreement)
  const seconds = methods.length === 1 ? methods[0]!.seconds : Math.exp(mean)
  const move = demonstrated !== null && demonstrated < seconds ? demonstrated / seconds : 1
  return {
    distanceM,
    seconds: seconds * move,
    low: Math.exp(mean - RACE_RANGE_Z * sd) * move,
    high: Math.exp(mean + RACE_RANGE_Z * sd) * move,
    methods,
    floored: move !== 1,
  }
}

/** The fastest of the bests at exactly this distance, s, or null when none was run there. */
function demonstratedAt(bests: readonly Performance[], distanceM: number): number | null {
  const same = bests.filter((b) => b.distanceM === distanceM).map((b) => b.seconds)
  return same.length === 0 ? null : Math.min(...same)
}

/**
 * The 5 km, 10 km, half marathon and marathon, each set in the middle of two estimates: the runner's bests
 * carried to the race, and the races the VO2max that heart rate gives would run, carried the same way. Both
 * pass through the same training-volume correction for the marathon. A race neither can judge is left out.
 */
export function predictRunRaces(input: RunPredictionInput): RunPredictions {
  const bests = input.bests.filter((b) => b.distanceM > 0 && b.seconds > 0)
  const sources: [PredictionMethod, Performance[]][] = [['performances', bests]]
  if (input.vo2max !== null) sources.push(['heartRate', heartRateAnchors(input.vo2max)])
  const races = RUN_RACE_DISTANCES_M.flatMap((distanceM) => {
    const methods = sources.flatMap(([method, anchors]) => {
      const time = timeFrom(anchors, distanceM, input.weeklyM)
      return time === null ? [] : [{ method, ...time }]
    })
    return methods.length === 0
      ? []
      : [predictionOf(distanceM, methods, demonstratedAt(bests, distanceM))]
  })
  const vdots = bests.map((b) => vdotOf(b.distanceM, b.seconds))
  return { races, runsVdot: vdots.length === 0 ? null : Math.max(...vdots), vo2max: input.vo2max }
}
