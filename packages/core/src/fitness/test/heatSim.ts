import { mulberry32, normal } from '../../math'
import { fitHeat, withoutHeat } from '../heat'
import type { HeatTerm } from '../heat'
import { monitor } from '../machine'
import type { WeekRecord } from '../machine'
import type { RunPoint } from '../windows'
import { simulate } from './runSim'
import type { SimSpec } from './runSim'

/**
 * Warm days for the run-level generator: each run's day has a temperature index (an annual swing and a day-to-day
 * weather draw), the athlete loses `b` log speed per 10 degrees above `threshold`, and the file records the index
 * to half a degree on `coverage` of the runs. The level draws are those of `simulate` for the same seed, so a run
 * with the term off and a run with it on read the same athlete.
 */
export interface HeatSpec extends SimSpec {
  heat: {
    /** The athlete's true loss, log speed per 10 index degrees above `threshold`. 0 for an athlete the heat does not touch. */
    b: number
    /** Share of the runs whose file carried a temperature. */
    coverage: number
    /** Mean, annual amplitude and weather spread of the index; the true threshold of the loss. */
    mean?: number
    amplitude?: number
    sd?: number
    threshold?: number
    /** A device change: from `week` on the recorded index is `delta` off the true one (the loss follows the true one). */
    bias?: { week: number; delta: number }
  }
}

const DAYS_PER_YEAR = 365.25
/** Days after the start of the library that the year's cool point comes at. */
const PHASE_DAYS = 60

/** The runs of `simulate`, each with the heat it lost and the temperature it recorded. */
export function simulateHeat(spec: HeatSpec, seed: number): RunPoint[] {
  const { b, coverage, mean = 14, amplitude = 9, sd = 4, threshold = 12, bias } = spec.heat
  const random = mulberry32(seed * 104729 + 31)
  return simulate(spec, seed).map((p) => {
    const swing = amplitude * Math.sin((2 * Math.PI * (p.t + PHASE_DAYS)) / DAYS_PER_YEAR)
    const index = mean + swing + sd * normal(random)
    const recorded = random() < coverage
    const shift = bias !== undefined && p.t >= bias.week * 7 ? bias.delta : 0
    const x = p.x - (b * Math.max(0, index - threshold)) / 10
    return recorded
      ? Object.assign({}, p, { x, c: Math.round((index + shift) * 2) / 2 })
      : Object.assign({}, p, { x })
  })
}

/**
 * The monitor over a simulated library with a warm-day term taken out: `'fit'` fits the term as of the last day (as
 * the status does), `null` takes none out, and a term is used as given (the tests flip its sign).
 */
export function replayHeat(
  points: RunPoint[],
  weeks: number,
  term: HeatTerm | null | 'fit',
): { records: WeekRecord[]; term: HeatTerm | null } {
  const used = term === 'fit' ? fitHeat(points, weeks * 7) : term
  return { records: monitor(withoutHeat(points, used) as RunPoint[], 0, weeks - 1), term: used }
}
