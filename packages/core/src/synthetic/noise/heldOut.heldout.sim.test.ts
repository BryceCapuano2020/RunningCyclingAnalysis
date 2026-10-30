import { describe, expect, it } from 'vitest'
import { HELD_OUT_CONFIGS, HELD_OUT_CONFIG_NAMES } from './heldOut'
import { UNIT_SPREAD_BANDS } from './heldOut.bands'
import { pooledUnitSpread } from './spread'

describe('held-out configurations', () => {
  // The same check the tuning sweeps rely on (a run is about 3.8% about its week), made on devices
  // and athletes no sweep saw. A miss means the generator, not a constant, has drifted.
  it.each(HELD_OUT_CONFIG_NAMES)(
    '%s: the same-heart-rate unit spread stays in its band',
    (name) => {
      const [lo, hi] = UNIT_SPREAD_BANDS[name]
      const spread = pooledUnitSpread(HELD_OUT_CONFIGS[name], 8, 78)
      expect(spread).toBeGreaterThanOrEqual(lo)
      expect(spread).toBeLessThanOrEqual(hi)
    },
  )
})
