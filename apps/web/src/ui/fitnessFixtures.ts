import type { FitnessPoint, FitnessState, FitnessStatus, Shortfall } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'

const DAY_MS = 86_400_000
const STEP_MS = 28 * DAY_MS

/** The status's date: the end of a Sunday in the autumn of 2026, which a step is dated by. Synthetic like every figure here. */
export const FITNESS_AS_OF_MS = Date.UTC(2026, 9, 25, 23, 59, 59, 999)
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
      weeks: 8,
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
      method: {
        tier: 'steady-pace',
        gradePassThrough: 0.8,
        speedPerBpm: 0.005,
        fitted: 400,
        seasonal: null,
      },
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

/** A rise that has settled at the new level: up 6% and holding. */
export const IMPROVED = fitnessStatus(
  'improved',
  (i) => (i < 5 ? 0.004 * Math.sin(i) : 0.06 + 0.004 * Math.sin(i)),
  {
    entered: { atMs: Date.UTC(2026, 9, 4, 23, 59, 59, 999), z: 5 },
  },
)

/** The rides a ride status rests on, newest last. */
export const FITNESS_RIDE_IDS = Array.from({ length: 12 }, (_, i) => `ride-${i + 1}`)

/** The rides as the library lists them, two days apart, newest last, with a power meter. */
export const FITNESS_RIDE_LIBRARY: ActivitySummary[] = FITNESS_RIDE_IDS.map((id, i) => ({
  id,
  name: `Evening ride ${i + 1}`,
  sport: 'ride',
  startMs: FITNESS_AS_OF_MS - (FITNESS_RIDE_IDS.length - 1 - i) * 2 * DAY_MS,
  durationS: 4200,
  distanceM: 30_000,
  elevationGainM: 200,
  hasHeartRate: true,
  indoor: false,
  powerSource: 'measured',
  flags: [],
  flagCounts: {},
  maxHeartRate: 170,
}))

/** Watts at the reference heart rate for each m/s of the run fixtures' level: 3.3 m/s is 200 W. */
const WATTS_PER_MS = 200 / FITNESS_BEFORE

/** The same story as a run status, told for a ride: the level in watts, the evidence the rides above, the method the power blocks. */
export function rideStatus(status: FitnessStatus): FitnessStatus {
  const scale = (v: number | null) => (v === null ? null : v * WATTS_PER_MS)
  return {
    ...status,
    sport: 'ride',
    referenceHr: 140,
    now: scale(status.now),
    before: scale(status.before),
    series: status.series.map((p) => ({
      ...p,
      value: p.value * WATTS_PER_MS,
      low: p.low * WATTS_PER_MS,
      high: p.high * WATTS_PER_MS,
    })),
    evidence:
      status.evidence === null
        ? null
        : {
            ...status.evidence,
            recent: { ...status.evidence.recent, ids: FITNESS_RIDE_IDS },
            method: {
              tier: 'power',
              gradePassThrough: null,
              speedPerBpm: 0.007,
              fitted: 90,
              seasonal: null,
            },
          },
  }
}

export const RIDE_SLIPPING = rideStatus(SLIPPING)

/** The fixtures' level in each sport's unit, and the heart rate it is read at. */
const LEVEL_SCALE: Record<Sport, number> = { run: 1, ride: WATTS_PER_MS }
const WAITING_HR: Record<Sport, number> = { run: 150, ride: 140 }

/**
 * A status that waits on what `shortfall` says, with `steady` steady activities in all, of a run unless `sport` says
 * otherwise. From 3 steady activities it tells the level (the fixtures' 3.3 m/s, or 200 W for a ride), as a real one does.
 */
export function waitingStatus(
  shortfall: Shortfall,
  steady = 7,
  sport: Sport = 'run',
): FitnessStatus {
  const scale = LEVEL_SCALE[sport]
  return {
    ...fitnessStatus('not-enough-evidence', () => 0),
    sport,
    referenceHr: WAITING_HR[sport],
    now: null,
    before: null,
    change: null,
    onsetMs: null,
    lowMs: null,
    evidence: null,
    series: [],
    shortfall,
    ...(steady < 3
      ? {}
      : {
          level: {
            value: FITNESS_BEFORE * scale,
            low: (FITNESS_BEFORE - 0.1) * scale,
            high: (FITNESS_BEFORE + 0.1) * scale,
            runs: steady,
            fromMs: FITNESS_AS_OF_MS - 40 * DAY_MS,
            toMs: FITNESS_AS_OF_MS - 2 * DAY_MS,
          },
        }),
    entered: null,
    steady,
  }
}
