import { describe, expect, it, vi } from 'vitest'
import type { Sport } from '../../types'
import { HELD_OUT_CONFIGS, HELD_OUT_CONFIG_NAMES } from './heldOut'
import type { HeldOutConfigName } from './heldOut'
import { FALSE_ALARM_BANDS, POWER_BANDS, UNIT_SPREAD_BANDS } from './heldOut.bands'
import { buildLibrary } from './library'
import { slipWeeksOf } from './slips'
import { pooledUnitSpread } from './spread'

vi.setConfig({ testTimeout: 600_000 })

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

/**
 * The fitness monitor on libraries of the held-out athletes, through the app's own path (activities
 * digested, a unit per steady effort, the monitor week by week). Eight libraries of three years each; a loss of
 * 8% starts in week 104, so the first two years are the null and the 26 weeks from the loss are the power window.
 * The sport is the one the configuration is built around.
 */
const WEEKS = 156
const LOSS_WEEK = 104
const WINDOW_WEEKS = 26
const LOSS = -0.08
const SEEDS = 8
const SPORT: Record<HeldOutConfigName, Sport> = { D: 'run', E: 'run', F: 'ride' }

const cache = new Map<HeldOutConfigName, (number[] | null)[]>()
function slipsOf(name: HeldOutConfigName): number[][] {
  let found = cache.get(name)
  if (found === undefined) {
    found = Array.from({ length: SEEDS }, (_, i) =>
      slipWeeksOf(
        buildLibrary(HELD_OUT_CONFIGS[name], i + 1, WEEKS, (w) => (w >= LOSS_WEEK ? LOSS : 0)),
        SPORT[name],
        WEEKS,
      ),
    )
    cache.set(name, found)
  }
  return found.filter((s): s is number[] => s !== null)
}

describe('the fitness monitor on held-out athletes', () => {
  // Slip declarations an athlete-year in the two years before the loss.
  it.each(HELD_OUT_CONFIG_NAMES)('%s: false alarms an athlete-year stay in their band', (name) => {
    const libraries = slipsOf(name)
    const alarms = libraries.reduce((n, s) => n + s.filter((w) => w < LOSS_WEEK).length, 0)
    const rate = alarms / (libraries.length * (LOSS_WEEK / 52))
    const [lo, hi] = FALSE_ALARM_BANDS[name]
    expect(rate).toBeGreaterThanOrEqual(lo)
    expect(rate).toBeLessThanOrEqual(hi)
  })

  // The share of libraries that declare a slip within 26 weeks of the 8% loss.
  it.each(HELD_OUT_CONFIG_NAMES)('%s: the share that see an 8% loss stays in its band', (name) => {
    const libraries = slipsOf(name)
    const seen = libraries.filter((s) =>
      s.some((w) => w >= LOSS_WEEK && w < LOSS_WEEK + WINDOW_WEEKS),
    ).length
    const [lo, hi] = POWER_BANDS[name]
    expect(seen / libraries.length).toBeGreaterThanOrEqual(lo)
    expect(seen / libraries.length).toBeLessThanOrEqual(hi)
  })
})
