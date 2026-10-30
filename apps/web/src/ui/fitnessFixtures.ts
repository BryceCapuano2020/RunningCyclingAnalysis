import type { FitnessPoint, FitnessState, FitnessStatus, Shortfall } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'

const DAY_MS = 86_400_000
const STEP_MS = 28 * DAY_MS

/** The status's date: a Sunday in the autumn of 2026. Synthetic like every figure here. */
export const FITNESS_AS_OF_MS = Date.UTC(2026, 9, 25)
/** The level before the change, m/s: 5:03 /km. */
export const FITNESS_BEFORE = 3.3

/** The ids of the runs a fixture's evidence rests on, newest last. */
export const FITNESS_RUN_IDS = Array.from({ length: 12 }, (_, i) => `run-${i + 1}`)

/** The runs as the library lists them, three days apart, newest last: what the evidence list is looked up in. */
export const FITNESS_LIBRARY: ActivitySummary[] = FITNESS_RUN_IDS.map((id, i) => ({
  id,
  name: `Morning run ${i + 1}`,
  sport: 'run',
  startMs: FITNESS_AS_OF_MS - (FITNESS_RUN_IDS.length - 1 - i) * 3 * DAY_MS,
  durationS: 2400,
  distanceM: 8000,
  elevationGainM: 10,
  hasHeartRate: true,
  indoor: false,
  powerSource: 'none',
  flags: [],
  flagCounts: {},
  maxHeartRate: 170,
}))

/** Fourteen four-week steps ending at the status's date, each at `FITNESS_BEFORE` times (1 + shape(i, 14)), 4% either way. */
export function fitnessSeries(shape: (i: number, n: number) => number, n = 14): FitnessPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const value = FITNESS_BEFORE * (1 + shape(i, n))
    return {
      atMs: FITNESS_AS_OF_MS - (n - 1 - i) * STEP_MS,
      value,
      low: value * 0.96,
      high: value * 1.04,
      runs: 7,
    }
  })
}

/** A run status in `state`, drawn from `shape`, whose level now is the last point's. */
export function fitnessStatus(
  state: FitnessState,
  shape: (i: number, n: number) => number,
  over: Partial<FitnessStatus> = {},
): FitnessStatus {
  const series = fitnessSeries(shape)
  const now = series.at(-1)!.value
  const delta = now / FITNESS_BEFORE - 1
  return {
    sport: 'run',
    state,
    referenceHr: 150,
    now,
    before: FITNESS_BEFORE,
    change: { value: delta, low: delta - 0.035, high: delta + 0.035 },
    gain: null,
    within: 0.03,
    onsetMs: FITNESS_AS_OF_MS - 9 * STEP_MS,
    lowMs: FITNESS_AS_OF_MS - 4 * STEP_MS,
    evidence: {
      recent: {
        fromMs: FITNESS_AS_OF_MS - 40 * DAY_MS,
        toMs: FITNESS_AS_OF_MS,
        runs: FITNESS_RUN_IDS.length,
        weeks: 6,
        ids: FITNESS_RUN_IDS,
      },
      baseline: {
        fromMs: FITNESS_AS_OF_MS - 300 * DAY_MS,
        toMs: FITNESS_AS_OF_MS - 90 * DAY_MS,
        runs: 28,
        weeks: 20,
      },
      method: { tier: 'steady-pace', gradePassThrough: 0.8, speedPerBpm: 0.005, fitted: 400 },
    },
    series,
    shortfall: null,
    // A state is entered at the end of its week, a Sunday: the week of 12 October.
    entered: { atMs: Date.UTC(2026, 9, 18, 23, 59, 59, 999), z: -4 },
    steady: 64,
    asOfMs: FITNESS_AS_OF_MS,
    ...over,
  }
}

/** Level to the ninth step, then falling 2% a step. */
const FALLING = (i: number) => (i < 9 ? 0.005 * Math.sin(i * 2) : -0.02 * (i - 8))
/** Level, down to 10% below, and back up 0.8% a step. */
const DIPPED = (i: number) =>
  i < 6 ? 0.01 * Math.sin(i) : i < 9 ? -0.03 * (i - 5) - 0.01 : -0.1 + 0.008 * (i - 9)

export const SLIPPING = fitnessStatus('slipping', FALLING)

export const RECOVERING = fitnessStatus('recovering', DIPPED, {
  gain: { value: 0.07, low: 0.03, high: 0.11 },
  entered: { atMs: Date.UTC(2026, 9, 4, 23, 59, 59, 999), z: 5 },
})

export const HOLDING = fitnessStatus('holding', (i) => 0.006 * Math.sin(i * 1.7), {
  onsetMs: null,
  lowMs: null,
  entered: null,
})

export const IMPROVING = fitnessStatus('improving', (i) => 0.012 * i - 0.04, {
  onsetMs: null,
  lowMs: null,
  entered: null,
})

/** A status that waits on what `shortfall` says, with `steady` steady runs in all. */
export function waitingStatus(shortfall: Shortfall, steady = 7): FitnessStatus {
  return {
    ...fitnessStatus('not-enough-evidence', () => 0),
    now: null,
    before: null,
    change: null,
    onsetMs: null,
    lowMs: null,
    evidence: null,
    series: [],
    shortfall,
    entered: null,
    steady,
  }
}
