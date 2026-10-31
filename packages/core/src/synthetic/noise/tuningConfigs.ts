import { DEFAULT_ATHLETE } from '../athlete'
import type { PersonaSpec } from './library'
import {
  EASY_RIDE,
  EASY_RUN,
  INTERVAL_RIDE,
  INTERVAL_RUN,
  LONG_RUN,
  RIDE_PLAN,
  RUN_PLAN,
  TEMPO_RIDE,
  TEMPO_RUN,
} from './personas'
import { NOISE_PRESETS } from './presets'
import { noiseWith } from './variants'

/**
 * Configurations A to C and S: the ones a tuning sweep may use (D1's model-error floor, D2's floor and
 * window, D5's null, detector constants). D to F are held out (heldOut.ts) and only a held-out test
 * may read them. Every value is synthetic.
 */
export const TUNING_CONFIG_NAMES = ['A', 'B', 'C', 'S'] as const
export type TuningConfigName = (typeof TUNING_CONFIG_NAMES)[number]

export const TUNING_CONFIGS: Record<TuningConfigName, PersonaSpec> = {
  /** An older runner: a lower maximum heart rate, a wrist watch, four runs a week. */
  A: {
    athlete: {
      ...DEFAULT_ATHLETE,
      massKg: 68,
      cpRun: 15,
      hrMax: 166,
      hrIntercept: 52,
      hrSlope: 6.8,
    },
    noise: NOISE_PRESETS.measured,
    plans: { run: { ...RUN_PLAN, perWeek: 4 } },
    gapsPerYear: 2,
  },
  /** A runner who also rides: a season, hot weeks and a chest strap. */
  B: {
    athlete: { ...DEFAULT_ATHLETE, massKg: 82, cpRide: 14.2, grossEfficiency: 0.21 },
    noise: noiseWith(NOISE_PRESETS.measured, {
      level: { seasonAmp: 0.02, heatDrop: 0.03 },
      heartRate: { lagS: 0, lock: { share: 0, minS: 0, maxS: 0 } },
    }),
    plans: { run: { ...RUN_PLAN, perWeek: 2.2 }, ride: { ...RIDE_PLAN, perWeek: 2.4 } },
    gapsPerYear: 3,
  },
  /** A low-volume runner on a phone: a wandering level and few hard efforts. */
  C: {
    athlete: { ...DEFAULT_ATHLETE, massKg: 91, cpRun: 13, runEconomyScale: 1.1, hrMax: 178 },
    noise: noiseWith(NOISE_PRESETS.phoneGps, { level: { wanderSd: 0.03, wanderRho: 0.95 } }),
    plans: {
      run: {
        ...RUN_PLAN,
        perWeek: 1.8,
        sessions: [
          EASY_RUN,
          LONG_RUN,
          { ...TEMPO_RUN, weight: 0.4 },
          { ...INTERVAL_RUN, weight: 0.2 },
        ],
        testEveryWeeks: 0,
        format: 'gpx',
      },
    },
    gapsPerYear: 2,
  },
  /** A rider with a power meter and a marked season: a 2.5% seasonal swing on a 2.5% wander, three rides a week, no runs. */
  S: {
    athlete: { ...DEFAULT_ATHLETE, massKg: 74, cpRide: 15.2, grossEfficiency: 0.205 },
    noise: noiseWith(NOISE_PRESETS.measured, { level: { wanderSd: 0.025, seasonAmp: 0.025 } }),
    plans: {
      ride: { ...RIDE_PLAN, perWeek: 3, sessions: [EASY_RIDE, TEMPO_RIDE, INTERVAL_RIDE] },
    },
    gapsPerYear: 3,
  },
}
