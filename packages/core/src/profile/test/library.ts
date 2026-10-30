import { DURATIONS_S } from '../../constants'
import { mulberry32, normal } from '../../math'
import type { ProfilePoint } from '../index'

/** Morton's model for a 250 W rider: CP 250, W' 20 kJ, Pmax 1000. */
export const truth = (t: number): number => 250 + 20_000 / (t + 20_000 / (1000 - 250))

export const LONGEST_S = 3600
/**
 * A library of `n` activities and the best it holds at each curve duration up to an hour. An activity reaches a length
 * between a minute and an hour and carries one effort through every duration it reaches, so the bests share their
 * efforts as real ones do (the monotone envelope). Each effort lands `shortfall` under the athlete's curve, carries the
 * meter's error as one number, and is lower at the lengths it did not aim at. Each duration also has a habit: the
 * athlete tries it more or less than the next (3%), which the curve's smoothness does not explain and which is what
 * makes durations stand out with nothing planted. `planted` raises one duration's best by a fraction.
 */
export function library(
  n: number,
  seed: number,
  shortfall: number,
  planted?: { durationS: number; size: number },
): ProfilePoint[] {
  const random = mulberry32(seed)
  const durations = DURATIONS_S.filter((d) => d <= LONGEST_S)
  const habit = durations.map(() => 0.03 * normal(random))
  const best = durations.map(() => ({ value: 0, session: '' }))
  for (let a = 0; a < n; a++) {
    const reach = Math.exp(Math.log(60) + random() * (Math.log(LONGEST_S) - Math.log(60)))
    const slope = 0.02 + 0.04 * random()
    const effort = Math.exp(-Math.abs(shortfall * normal(random)))
    const meter = Math.exp(0.03 * normal(random))
    durations.forEach((d, i) => {
      if (d > reach) return
      const value =
        truth(d) *
        effort *
        meter *
        Math.exp(habit[i]! - slope * Math.log(reach / d) + 0.01 * normal(random))
      if (value > best[i]!.value) best[i] = { value, session: `a${a}` }
    })
  }
  for (let i = durations.length - 2; i >= 0; i--) {
    if (best[i]!.value < best[i + 1]!.value) best[i] = best[i + 1]!
  }
  return durations.flatMap((durationS, i) =>
    best[i]!.value > 0
      ? [
          {
            durationS,
            value: best[i]!.value * (planted?.durationS === durationS ? 1 + planted.size : 1),
            sessionId: best[i]!.session,
          },
        ]
      : [],
  )
}
