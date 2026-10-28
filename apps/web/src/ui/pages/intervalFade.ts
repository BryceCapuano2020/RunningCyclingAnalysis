import type { ActivityLap, ActivityTrace } from '@rca/core/workbench'
import type { Sport } from '@rca/core/types'
import { selectionOf, suggestedIntervals } from './workbenchData'
import { clampSelection } from './workbenchTime'
import type { Selection } from './workbenchTime'

/**
 * What makes laps a set of reps. The reps are laps of about one length, so a drift between them is the
 * athlete's and not the interval's. minReps is how many it takes to speak of a fade. lengthTolerance is
 * how far a rep's duration may be from the middle one's. A fall of levelPct percent or less reads as
 * level. A split of splitGap or more between the hard laps and the easy ones means the easy ones are
 * the recoveries between, which are left out.
 */
export const REP_FADE = { minReps: 3, lengthTolerance: 0.2, levelPct: 2, splitGap: 0.15 } as const

/** A seconds gap smaller than this between two laps means they run into each other. */
const BACK_TO_BACK_S = 1

/** The measures a rep's output is read from, in order: the first that every rep has. Keyed by Sport. */
const OUTPUT_METRICS: Record<Sport, readonly RepMetric[]> = {
  run: ['speed'],
  ride: ['power', 'speed'],
}

export type RepMetric = 'speed' | 'power'

/** How the lede says a rep's output differs from the first rep's, for each measure. */
const DIFFERENCE: Record<RepMetric, (percent: number, higher: boolean) => string> = {
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
  /** Mean speed in m/s or power in W while moving. */
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
 * The hard laps of a set that holds hard laps and easy ones, as indices: where the sorted outputs part by
 * splitGap or more, the laps above the split. A set with no such split is returned whole.
 */
export function hardLaps(
  indices: readonly number[],
  outputOf: (index: number) => number,
): number[] {
  const sorted = [...indices].sort((a, b) => outputOf(b) - outputOf(a))
  for (let k = 0; k + 1 < sorted.length; k++) {
    const above = outputOf(sorted[k]!)
    if ((above - outputOf(sorted[k + 1]!)) / above >= REP_FADE.splitGap) {
      return sorted.slice(0, k + 1).sort((a, b) => a - b)
    }
  }
  return [...indices]
}

/** The laps the device recorded, or the intervals found in the readings when it recorded none. */
function lapsOf(trace: ActivityTrace): { laps: ActivityLap[]; recorded: boolean } {
  const recorded = trace.laps.length > 0
  return { laps: recorded ? trace.laps : suggestedIntervals(trace), recorded }
}

/**
 * The lede: the rep that differs most from the first, or that the reps stayed level. A difference is the
 * rep's output over the first rep's, in the measure the table shows.
 */
export function fadeLede(metric: RepMetric, outputs: readonly number[]): string {
  const first = outputs[0]!
  const changes = outputs.map((output) => output / first - 1)
  const widest = changes.reduce(
    (far, change, i) => (Math.abs(change) > Math.abs(changes[far]!) ? i : far),
    0,
  )
  const percent = Math.round(Math.abs(changes[widest]!) * 100)
  if (percent <= REP_FADE.levelPct) return `Your reps stayed within ${Math.max(percent, 1)}%.`
  return `Rep ${widest + 1} ${DIFFERENCE[metric](percent, changes[widest]! > 0)} rep 1.`
}

/**
 * How a run of reps held up, or null when the activity has none: at least minReps laps of one length with
 * an output each, set apart from the recoveries between them. Laps that run straight into each other
 * are splits of one effort, which the splits already show, so they are not reps.
 */
export function repFadeOf(trace: ActivityTrace): RepFade | null {
  const max = Math.floor(trace.durationS)
  const { laps, recorded } = lapsOf(trace)
  const usable = laps.flatMap((lap, i) =>
    lap.endS > lap.startS && max >= 1
      ? [{ lapNumber: i + 1, bounds: clampSelection(lap, max) }]
      : [],
  )
  const summaries = usable.map(({ bounds }) => selectionOf(trace, bounds.startS, bounds.endS))
  const metric = OUTPUT_METRICS[trace.sport].find((candidate) =>
    summaries.some((summary) => typeof summary.metrics[candidate]?.mean === 'number'),
  )
  if (metric === undefined) return null
  const outputOf = (i: number) => summaries[i]!.metrics[metric]?.mean ?? -Infinity
  const readable = usable.flatMap((_, i) => (Number.isFinite(outputOf(i)) ? [i] : []))
  const lengths = readable.map((i) => usable[i]!.bounds.endS - usable[i]!.bounds.startS)
  const similar = similarLengths(lengths, (k) => outputOf(readable[k]!)).map((k) => readable[k]!)
  const chosen = hardLaps(similar, outputOf)
  if (chosen.length < REP_FADE.minReps) return null
  const reps = chosen.map((i, k): Rep => {
    const { lapNumber, bounds } = usable[i]!
    return {
      number: k + 1,
      lapNumber,
      bounds,
      durationS: bounds.endS - bounds.startS,
      output: outputOf(i),
      heartRate: summaries[i]!.metrics.heartRate?.mean ?? null,
    }
  })
  const joined = reps.every(
    (rep, k) => k === 0 || Math.abs(rep.bounds.startS - reps[k - 1]!.bounds.endS) < BACK_TO_BACK_S,
  )
  if (joined) return null
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
