import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '@rca/core/constants'
import { effortCaveat } from '../ui/effortCaveat'
import { LONG_CAVEAT } from './fixtures'

describe('LONG_CAVEAT', () => {
  it('is at least as long as every caveat line the app can draw, at every duration it can name', () => {
    // A low run, a low ride and both low, each with the heart-rate fractions effortCaveat reads.
    const branches = [
      { runHrFraction: 0.7, rideHrFraction: 0.7 },
      { runHrFraction: 0.95, rideHrFraction: 0.7 },
      { runHrFraction: 0.7, rideHrFraction: 0.95 },
    ]
    const shorts = DURATIONS_S.flatMap((durationS) =>
      branches.map((branch) => effortCaveat({ durationS, ...branch })?.short ?? ''),
    )
    expect(LONG_CAVEAT.length).toBeGreaterThanOrEqual(
      Math.max(...shorts.map((text) => text.length)),
    )
  })
})
