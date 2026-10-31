import { mulberry32, normal, quantile } from '../../math'
import { heatOf, heatTerm, withHeat } from '../heat'
import type { HeatRun } from '../heat'
import type { WeekRecord } from '../machine'
import type { RunPoint } from '../windows'
import { replaySim, simulate, slipWeeks } from './runSim'
import type { SimSpec } from './runSim'

/**
 * Runs whose value falls on warm days. The level, the spread of a run and the planted change are `simulate`'s;
 * on top of them each run has a day's warmth on the sensor's index (a yearly swing and a day-to-day spread), a
 * warm day costs `b` log units for every ten degrees above the athlete's cooler runs, and the file records the
 * index on only `coverage` of the runs. The cost falls on every run, recorded or not.
 */
export interface HeatSpec extends SimSpec {
  heat: {
    /** Log of speed lost for every ten index degrees above the cooler runs. Zero is an athlete who does not slow in the heat. */
    b: number
    /** Share of the runs whose file carries the index. */
    coverage: number
    /** Middle of the yearly swing and its size, and the day-to-day spread, in index degrees. */
    mean?: number
    swing?: number
    sd?: number
    /** From this week, the sensor reads this many index degrees higher than before (a new watch). It costs the athlete nothing. */
    biasStep?: { week: number; size: number }
  }
}

const DEFAULTS = { mean: 14, swing: 9, sd: 2.5 }

/** The runs with their index, and the cost of a warm day taken from their values. */
export function simulateWithHeat(spec: HeatSpec, seed: number): HeatRun[] {
  const { b, coverage, biasStep } = spec.heat
  const { mean, swing, sd } = { ...DEFAULTS, ...spec.heat }
  const points = simulate(spec, seed)
  const random = mulberry32(seed * 104_729 + 7)
  const indices = points.map(
    (p) => mean + swing * Math.sin((2 * Math.PI * (p.t - 80)) / 365.25) + sd * normal(random),
  )
  // The athlete's cooler runs: the 25th percentile of the true days, which the term estimates from the recorded ones.
  const cooler = quantile(indices, 0.25)
  return points.map((p, i) => {
    const recorded = random() < coverage
    const week = Math.floor(p.t / 7)
    const bias = biasStep !== undefined && week >= biasStep.week ? biasStep.size : 0
    return {
      id: p.id,
      t: p.t,
      x: p.x - b * heatOf(indices[i]!, cooler),
      c: recorded ? indices[i]! + bias : null,
    }
  })
}

/** The runs as the monitor reads them: with the warm-day term added back when it is on, or untouched. */
export function readAsApp(runs: readonly HeatRun[], weeks: number): RunPoint[] {
  const term = heatTerm(runs, weeks * 7)
  return term === null ? runs.map(({ id, t, x }) => ({ id, t, x })) : withHeat(runs, term)
}

/** The monitor over the library as the app reads it (`term`) or with the term left out (the library as before it). */
export function replayHeat(runs: readonly HeatRun[], weeks: number, term: boolean): WeekRecord[] {
  const points = term ? readAsApp(runs, weeks) : runs.map(({ id, t, x }) => ({ id, t, x }))
  return replaySim(points, weeks)
}

/** Slip declarations an athlete-year over libraries from `seeds`, at each rate of runs a week. */
export function slipsPerYear(
  spec: Omit<HeatSpec, 'perWeek'>,
  rates: readonly number[],
  seeds: number,
  term: boolean,
): number {
  let alarms = 0
  for (const perWeek of rates) {
    for (let seed = 1; seed <= seeds; seed++) {
      const full = { ...spec, perWeek }
      alarms += slipWeeks(replayHeat(simulateWithHeat(full, seed + 2000), spec.weeks, term)).length
    }
  }
  return alarms / (rates.length * seeds * (spec.weeks / 52))
}
