import { describe, expect, it } from 'vitest'
import { PERSONAS } from './personas'
import { NOISE_PRESETS } from './presets'
import { pooledUnitSpread } from './spread'

describe('the generator and the preset agree on the spread of one run', () => {
  // `measured` says a run is 3.8% about its week (runSd). The same-heart-rate unit read off whole
  // generated runs, through the devices' noise and the app's own digest, shows that spread within half a point.
  it('watchRunner: the same-heart-rate unit spread is the measured 3.8%, plus or minus 0.5', () => {
    const target = NOISE_PRESETS.measured.level.runSd
    expect(target).toBe(0.038)
    const spread = pooledUnitSpread(PERSONAS.watchRunner, 12, 104)
    expect(spread).toBeGreaterThanOrEqual(target - 0.005)
    expect(spread).toBeLessThanOrEqual(target + 0.005)
  })
})
