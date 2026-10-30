import { describe, expect, it } from 'vitest'
import { generatedSplitHalf } from './generatedBests'
import { NOISE_PRESETS } from './presets'

/**
 * Bests from real generated activities show the split-half spread the measured preset claims
 * (about 4.5% for a run at 20 min, about 12.5% for a ride at 5 min). A pool of 1000 adds about half a
 * point of sampling noise, hence the upper edges.
 */
describe('generated bests', () => {
  it.each([
    { sport: 'run', band: [0.04, 0.06] },
    { sport: 'ride', band: [0.115, 0.14] },
  ] as const)('$sport: split-half spread of 6 against 6', ({ sport, band }) => {
    const median = generatedSplitHalf(NOISE_PRESETS.measured, sport, 1000, 3000)
    expect(median).toBeGreaterThanOrEqual(band[0])
    expect(median).toBeLessThanOrEqual(band[1])
  })
})
