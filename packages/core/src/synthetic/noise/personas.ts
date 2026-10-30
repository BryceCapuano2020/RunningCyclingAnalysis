import { DEFAULT_ATHLETE } from '../athlete'
import type { SyntheticAthlete } from '../athlete'
import { buildLibrary } from './library'
import type { Library, PersonaSpec, Session, SportPlan } from './library'
import { NOISE_PRESETS } from './presets'
import { noiseWith } from './variants'

/**
 * The athletes the audit's cliffs name (RCA-013) and the one-sport home needs (RCA-015). Each is a
 * whole spec: ground truth, devices and habits. Every value is synthetic.
 */

export const EASY_RUN: Session = {
  effort: 'easy',
  terrain: 'rolling',
  minutes: [35, 65],
  weight: 5,
}
export const LONG_RUN: Session = {
  effort: 'easy',
  terrain: 'rolling',
  minutes: [75, 100],
  weight: 1.2,
}
export const TEMPO_RUN: Session = {
  effort: 'tempo',
  terrain: 'flat',
  minutes: [45, 60],
  weight: 1.5,
}
export const INTERVAL_RUN: Session = {
  effort: 'intervals',
  terrain: 'flat',
  minutes: [50, 60],
  weight: 1,
}
export const EASY_RIDE: Session = {
  effort: 'easy',
  terrain: 'rolling',
  minutes: [60, 120],
  weight: 4,
}
export const TEMPO_RIDE: Session = {
  effort: 'tempo',
  terrain: 'rolling',
  minutes: [70, 100],
  weight: 1.5,
}
export const INTERVAL_RIDE: Session = {
  effort: 'intervals',
  terrain: 'flat',
  minutes: [60, 80],
  weight: 1,
}

export const RUN_PLAN: SportPlan = {
  perWeek: 3.4,
  sessions: [EASY_RUN, LONG_RUN, TEMPO_RUN, INTERVAL_RUN],
  testEveryWeeks: 11,
  race: { everyWeeks: 14, distanceM: 5000 },
  format: 'fit',
}

export const RIDE_PLAN: SportPlan = {
  perWeek: 2.6,
  sessions: [EASY_RIDE, TEMPO_RIDE, INTERVAL_RIDE],
  testEveryWeeks: 10,
  withPower: true,
  format: 'fit',
}

/** A slower athlete: lower critical speed, a steeper heart-rate line. */
const SLOW_RUNNER: SyntheticAthlete = {
  ...DEFAULT_ATHLETE,
  massKg: 88,
  cpRun: 12.5,
  runEconomyScale: 1.08,
  hrIntercept: 58,
  hrSlope: 8.5,
  hrMax: 186,
}

export const PERSONA_NAMES = [
  'watchRunner',
  'phoneSlowRunner',
  'treadmillHeavy',
  'treadmillOnly',
  'ridePower',
  'rideNoPower',
  'twoSport',
] as const
export type PersonaName = (typeof PERSONA_NAMES)[number]

export const PERSONAS: Record<PersonaName, PersonaSpec> = {
  /** A runner with a wrist watch: the `measured` level, outdoor runs, FIT files. */
  watchRunner: {
    athlete: DEFAULT_ATHLETE,
    noise: NOISE_PRESETS.measured,
    plans: { run: RUN_PLAN },
    gapsPerYear: 2,
    utcOffsetH: -7,
  },
  /** A slow runner on a phone with a chest strap: no cadence, GPX files, noisy GPS. */
  phoneSlowRunner: {
    athlete: SLOW_RUNNER,
    noise: NOISE_PRESETS.phoneGps,
    plans: {
      run: { ...RUN_PLAN, perWeek: 2.8, sessions: [EASY_RUN, LONG_RUN], format: 'gpx' },
    },
    gapsPerYear: 2,
    utcOffsetH: 1,
  },
  /** Most runs on a treadmill: 7 in 10. The rest are outdoors on a watch. */
  treadmillHeavy: {
    athlete: DEFAULT_ATHLETE,
    noise: noiseWith(NOISE_PRESETS.measured, { behaviour: { treadmillShare: 0.7 } }),
    plans: { run: RUN_PLAN },
    gapsPerYear: 2,
  },
  /** Every run on a treadmill: belt speed, no altitude, no route. */
  treadmillOnly: {
    athlete: DEFAULT_ATHLETE,
    noise: noiseWith(NOISE_PRESETS.measured, { behaviour: { treadmillShare: 1 } }),
    plans: { run: RUN_PLAN },
    gapsPerYear: 2,
  },
  /** A rider with a power meter and a wrist watch. */
  ridePower: {
    athlete: DEFAULT_ATHLETE,
    noise: NOISE_PRESETS.measured,
    plans: { ride: RIDE_PLAN },
    gapsPerYear: 2,
  },
  /** A rider without a power meter: speed and heart rate only. */
  rideNoPower: {
    athlete: DEFAULT_ATHLETE,
    noise: NOISE_PRESETS.measured,
    plans: { ride: { ...RIDE_PLAN, withPower: false, testEveryWeeks: 0 } },
    gapsPerYear: 2,
  },
  /** Runs and rides, a few of the runs on a treadmill. */
  twoSport: {
    athlete: DEFAULT_ATHLETE,
    noise: noiseWith(NOISE_PRESETS.measured, { behaviour: { treadmillShare: 0.15 } }),
    plans: { run: { ...RUN_PLAN, perWeek: 2.6 }, ride: { ...RIDE_PLAN, perWeek: 2 } },
    gapsPerYear: 2,
  },
}

const DEFAULT_WEEKS = 40

/** A named persona's history, deterministic in `seed`. */
export function persona(name: PersonaName, seed: number, weeks = DEFAULT_WEEKS): Library {
  return buildLibrary(PERSONAS[name], seed, weeks)
}
