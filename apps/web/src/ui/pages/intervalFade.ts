import type { ActivityLap, ActivityTrace } from '@rca/core/workbench'
import type { Sport } from '@rca/core/types'
import { flatSpeedOf } from './repFlatPace'
import { selectionOf, suggestedIntervals } from './workbenchData'
import { clampSelection } from './workbenchTime'
import type { Selection } from './workbenchTime'

/**
 * What makes laps a set of reps. The reps are laps of about one length, so a drift between them is the
 * athlete's and not the interval's. minReps is how many it takes to speak of a fade. lengthTolerance is
 * how far a rep's duration may be from the middle one's. A fall of levelPct percent or less reads as
 * level. A split of splitGap or more between the hard laps and the easy ones means the easy ones are
 * the recoveries between, which are left out. A recovery between two reps is a lap that is clearly slower
 * (splitGap or more below the reps' middle output) or clearly shorter (lengthTolerance or more below their
 * middle length), or, with no lap between, a rest of restS or more that no lap covers.
 */
export const REP_FADE = {
  minReps: 3,
  lengthTolerance: 0.2,
  levelPct: 2,
  splitGap: 0.15,
  restS: 10,
} as const

/**
 * The measures a rep's output is read from, best first, and whether a speed stands in only on a trainer:
 * a road ride's speed is the road's and the wind's, not the rider's. Keyed by Sport.
 */
const OUTPUT: Record<Sport, { metrics: readonly RepMetric[]; speedNeedsTrainer: boolean }> = {
  run: { metrics: ['flatSpeed', 'speed'], speedNeedsTrainer: false },
  ride: { metrics: ['power', 'speed'], speedNeedsTrainer: true },
}

/** Flat speed is a run's speed with the hills taken out, in m/s like speed. */
export type RepMetric = 'flatSpeed' | 'speed' | 'power'

/** How the lede says a rep's output differs from the first rep's, for each measure. */
const DIFFERENCE: Record<RepMetric, (percent: number, higher: boolean) => string> = {
  flatSpeed: (percent, higher) => `was ${percent}% ${higher ? 'faster' : 'slower'} than`,
  speed: (percent, higher) => `was ${percent}% ${higher ? 'faster' : 'slower'} than`,
  power: (percent, higher) => `averaged ${percent}% ${higher ? 'more' : 'less'} power than`,
}

export interface Rep {
  /** Its place among the reps, from 1. */
  number: number
  /** Its place among all the laps or intervals, from 1: the number on the lap buttons. */
  lapNumber: number
  bounds: Selection
  durationS: number
  /** Mean flat or recorded speed in m/s, or power in W, while moving. */
  output: number
  /** Mean heart rate in bpm, or null when it has no reading. */
  heartRate: number | null
}

export interface RepFade {
  metric: RepMetric
  /** True when the device recorded the laps, false when they are intervals found in the readings. */
  recorded: boolean
  reps: Rep[]
  lede: string
}

/** The middle value, the mean of the middle two for an even count. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * The largest set of items whose lengths are within the tolerance of the set's middle length, as
 * indices in their order. A tie goes to the set with the higher score, then the earlier one: reps are
 * the harder laps, so a tie between reps and the recoveries of the same length goes to the reps.
 */
export function similarLengths(
  lengths: readonly number[],
  scoreOf: (index: number) => number,
): number[] {
  let best: { indices: number[]; score: number } = { indices: [], score: -Infinity }
  for (const anchor of lengths) {
    const near = lengths.flatMap((length, i) =>
      Math.abs(length - anchor) <= REP_FADE.lengthTolerance * anchor ? [i] : [],
    )
    const middle = median(near.map((i) => lengths[i]!))
    const indices = near.filter(
      (i) => Math.abs(lengths[i]! - middle) <= REP_FADE.lengthTolerance * middle,
    )
    const score = indices.reduce((sum, i) => sum + scoreOf(i), 0) / indices.length
    if (
      indices.length > best.indices.length ||
      (indices.length === best.indices.length && score > best.score)
    ) {
      best = { indices, score }
    }
  }
  return best.indices
}

/**
 * The reps of a set that holds reps and the recoveries between them, as indices in order. The hard laps
 * are those above the first split of splitGap or more in the sorted outputs. They are the reps' places
 * only when they alternate with the easy laps: every hard lap sits at a place of the same parity in the
 * set, so the lap at each such place is a rep, even a slow one at the end or the start that has fallen
 * to the recoveries' pace. Laps at the other places are recoveries and are left out. Any other
 * pattern, such as slow laps with no recoveries between, is not alternation, and every lap is a rep:
 * a rep that blew up is the fade to show, not a recovery.
 */
export function hardLaps(
  indices: readonly number[],
  outputOf: (index: number) => number,
): number[] {
  const sorted = [...indices].sort((a, b) => outputOf(b) - outputOf(a))
  for (let k = 0; k + 1 < sorted.length; k++) {
    const above = outputOf(sorted[k]!)
    if ((above - outputOf(sorted[k + 1]!)) / above < REP_FADE.splitGap) continue
    const hard = new Set(sorted.slice(0, k + 1))
    const places = indices.flatMap((lap, place) => (hard.has(lap) ? [place] : []))
    const parity = places[0]! % 2
    if (places.length < 2 || places.some((place) => place % 2 !== parity)) return [...indices]
    return indices.filter((_, place) => place % 2 === parity)
  }
  return [...indices]
}

/**
 * Whether every rep after the first follows a recovery: the laps between it and the rep before it are all
 * clearly slower or shorter than the reps, or, with none between, a rest that no lap covers. Equal laps run
 * one into the next at one effort, such as a run's auto-laps, are splits of a steady run and not reps.
 */
function recoversBetween(
  chosen: readonly number[],
  usable: readonly Usable[],
  outputs: readonly number[],
  lengths: readonly number[],
): boolean {
  const repOutput = median(chosen.map((i) => outputs[i]!))
  const repLength = median(chosen.map((i) => lengths[i]!))
  const isRecovery = (lap: number) =>
    outputs[lap]! <= repOutput * (1 - REP_FADE.splitGap) ||
    lengths[lap]! <= repLength * (1 - REP_FADE.lengthTolerance)
  return chosen.every((lap, k) => {
    if (k === 0) return true
    const before = chosen[k - 1]!
    const between = Array.from({ length: lap - before - 1 }, (_, n) => before + 1 + n)
    if (between.length > 0) return between.every(isRecovery)
    return usable[lap]!.bounds.startS - usable[before]!.bounds.endS >= REP_FADE.restS
  })
}

/** The laps the device recorded, or the intervals found in the readings when it recorded none. */
function lapsOf(trace: ActivityTrace): { laps: ActivityLap[]; recorded: boolean } {
  const recorded = trace.laps.length > 0
  return { laps: recorded ? trace.laps : suggestedIntervals(trace), recorded }
}

/**
 * The lede: the rep that differs most from the first, or that the reps stayed level. The gap is the
 * rep's output over the first rep's, unrounded, so 2.4% is a difference and not "within 2%".
 */
export function fadeLede(metric: RepMetric, outputs: readonly number[]): string {
  const first = outputs[0]!
  const changes = outputs.map((output) => output / first - 1)
  const widest = changes.reduce(
    (far, change, i) => (Math.abs(change) > Math.abs(changes[far]!) ? i : far),
    0,
  )
  const gap = Math.abs(changes[widest]!) * 100
  if (gap <= REP_FADE.levelPct) return `Your reps stayed within ${Math.max(Math.ceil(gap), 1)}%.`
  return `Rep ${widest + 1} ${DIFFERENCE[metric](Math.round(gap), changes[widest]! > 0)} rep 1.`
}

interface Usable {
  lapNumber: number
  bounds: Selection
}

/** The mean of a measure over a lap, NaN where it has no reading. */
function outputOver(trace: ActivityTrace, metric: RepMetric, { bounds }: Usable): number {
  const { startS, endS } = bounds
  if (metric === 'flatSpeed') return flatSpeedOf(trace, startS, endS) ?? Number.NaN
  return selectionOf(trace, startS, endS).metrics[metric]?.mean ?? Number.NaN
}

/**
 * The reps read in one measure, or null when it cannot read them: every lap of the set of one length
 * must have it, so no rep is dropped for want of a reading.
 */
function repsIn(trace: ActivityTrace, metric: RepMetric, usable: Usable[]): Rep[] | null {
  const outputs = usable.map((lap) => outputOver(trace, metric, lap))
  const lengths = usable.map(({ bounds }) => bounds.endS - bounds.startS)
  const score = (i: number) => (Number.isFinite(outputs[i]!) ? outputs[i]! : -Infinity)
  const similar = similarLengths(lengths, score)
  if (similar.some((i) => !Number.isFinite(outputs[i]!))) return null
  const chosen = hardLaps(similar, score)
  if (chosen.length < REP_FADE.minReps) return null
  if (!recoversBetween(chosen, usable, outputs, lengths)) return null
  return chosen.map((i, k) => {
    const { lapNumber, bounds } = usable[i]!
    const { startS, endS } = bounds
    return {
      number: k + 1,
      lapNumber,
      bounds,
      durationS: endS - startS,
      output: outputs[i]!,
      heartRate: selectionOf(trace, startS, endS).metrics.heartRate?.mean ?? null,
    }
  })
}

/**
 * How a run of reps held up, or null when the activity has none: at least minReps laps of one length,
 * set apart from the recoveries between them (see recoversBetween), all read in one measure. A run is read
 * as flat pace where its altitude allows, else as recorded; a ride by its power, or by its speed on a
 * trainer only. Laps with no recovery between them are splits of one steady effort, which the splits show.
 */
export function repFadeOf(trace: ActivityTrace, { indoor }: { indoor: boolean }): RepFade | null {
  const max = Math.floor(trace.durationS)
  const { laps, recorded } = lapsOf(trace)
  const usable = laps.flatMap((lap, i) =>
    lap.endS > lap.startS && max >= 1
      ? [{ lapNumber: i + 1, bounds: clampSelection(lap, max) }]
      : [],
  )
  const { metrics, speedNeedsTrainer } = OUTPUT[trace.sport]
  for (const metric of metrics) {
    if (metric === 'speed' && speedNeedsTrainer && !indoor) continue
    const reps = repsIn(trace, metric, usable)
    if (reps === null) continue
    return {
      metric,
      recorded,
      reps,
      lede: fadeLede(
        metric,
        reps.map((rep) => rep.output),
      ),
    }
  }
  return null
}
