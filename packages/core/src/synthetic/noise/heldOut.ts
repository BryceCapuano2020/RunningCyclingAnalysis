import { DEFAULT_ATHLETE } from '../athlete'
import type { PersonaSpec } from './library'
import {
  EASY_RUN,
  EASY_RIDE,
  INTERVAL_RIDE,
  LONG_RUN,
  RIDE_PLAN,
  RUN_PLAN,
  TEMPO_RIDE,
} from './personas'
import { NOISE_PRESETS } from './presets'
import { noiseWith } from './variants'

/**
 * Configurations D to F, held out. A tuning sweep must never read these: they exist to check, once
 * a constant is chosen on A to C (tuningConfigs.ts), that the choice was not fitted to them. Only
 * `*.heldout.test.ts` and `*.heldout.sim.test.ts` may import this file; heldOutGuard.test.ts fails
 * when anything else does. Every value is synthetic, and none comes from a real athlete.
 */
export const HELD_OUT_CONFIG_NAMES = ['D', 'E', 'F'] as const
export type HeldOutConfigName = (typeof HELD_OUT_CONFIG_NAMES)[number]

export const HELD_OUT_CONFIGS: Record<HeldOutConfigName, PersonaSpec> = {
  /** A fast, high-volume runner on a chest strap with a new strap part-way; a quarter of runs on a treadmill. */
  D: {
    athlete: { ...DEFAULT_ATHLETE, massKg: 64, cpRun: 19, runEconomyScale: 0.97, hrMax: 192 },
    noise: noiseWith(NOISE_PRESETS.strapStep, { behaviour: { treadmillShare: 0.25 } }),
    plans: { run: { ...RUN_PLAN, perWeek: 5, sessions: [EASY_RUN, LONG_RUN] } },
    gapsPerYear: 2,
  },
  /** A heavy, slow runner with a wrist that locks on the step rate, a wide wander and no cadence stream. */
  E: {
    athlete: {
      ...DEFAULT_ATHLETE,
      massKg: 102,
      cpRun: 11.5,
      runEconomyScale: 1.12,
      hrIntercept: 60,
      hrSlope: 9.2,
      hrMax: 181,
    },
    noise: noiseWith(NOISE_PRESETS.nuisanceAll, { gps: { speedSd: 0.05 } }),
    plans: { run: { ...RUN_PLAN, perWeek: 2.4, format: 'gpx' } },
    gapsPerYear: 4,
  },
  /** A rider who runs now and then: an easy-ride habit, a noisy hard-effort reading, long gaps. */
  F: {
    athlete: { ...DEFAULT_ATHLETE, massKg: 78, cpRide: 16.5, grossEfficiency: 0.2, cda: 0.29 },
    noise: noiseWith(NOISE_PRESETS.measured, {
      behaviour: { effortSd: { run: 0.09, ride: 0.25 } },
      level: { wanderSd: 0.025, seasonAmp: 0.025 },
    }),
    plans: {
      run: { ...RUN_PLAN, perWeek: 1.2, race: undefined, testEveryWeeks: 0, sessions: [EASY_RUN] },
      ride: { ...RIDE_PLAN, perWeek: 3.4, sessions: [EASY_RIDE, TEMPO_RIDE, INTERVAL_RIDE] },
    },
    gapsPerYear: 4,
  },
}
