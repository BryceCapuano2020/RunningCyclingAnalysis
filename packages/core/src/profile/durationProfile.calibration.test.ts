import { describe, expect, it } from 'vitest'
import { mulberry32, normal } from '../math'
import { durationProfile } from './index'
import type { ProfilePoint } from './index'

/** Morton's model for a 250 W rider: CP 250, W' 20 kJ, Pmax 1000. */
const trueValue = (t: number): number => 250 + 20_000 / (t + 20_000 / (1000 - 250))

const SETS: Record<string, number[]> = {
  '5 durations': [5, 15, 60, 600, 3600],
  '8 durations': [5, 30, 60, 240, 600, 1200, 1800, 3600],
  '18 durations': [
    5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600,
  ],
}

const TRIALS: Record<string, number> = {
  '5 durations': 400,
  '8 durations': 400,
  '18 durations': 400,
}

/** Share of profiles of pure noise, on a true Morton curve, that flag at least one duration. */
function falseAlarmRate(durations: number[], noise: number, trials: number, seed: number): number {
  const rand = mulberry32(seed)
  let flagged = 0
  for (let trial = 0; trial < trials; trial++) {
    const points = durations.map((durationS, i): ProfilePoint => ({
      durationS,
      value: trueValue(durationS) * Math.exp(noise * normal(rand)),
      sessionId: `session-${i % 4}`,
    }))
    const profile = durationProfile(points)
    if (profile.status === 'ready' && profile.rows.some((row) => row.standsOut !== null)) flagged++
  }
  return flagged / trials
}

/** A simulation of hundreds of profiles takes about a second, and a loaded runner many times that. */
const SIMULATION_TIMEOUT_MS = 120_000

describe('the profile’s false alarms', () => {
  // The noise is each best's own error around a true curve: a third of the meter's 3%, the meter's, and
  // twice it. A profile of nothing but noise should say that something stands out rarely.
  for (const [name, durations] of Object.entries(SETS)) {
    for (const noise of [0.01, 0.03, 0.06]) {
      it(
        `flags something in under 10% of profiles of pure ${noise * 100}% noise, at ${name}`,
        () => {
          const trials = TRIALS[name]!
          expect(falseAlarmRate(durations, noise, trials, 20_261_027)).toBeLessThan(0.1)
        },
        SIMULATION_TIMEOUT_MS,
      )
    }
  }
})
