import { describe, expect, it, vi } from 'vitest'
import { fitnessStatuses } from './compute'
import { RIDE_FITNESS_ENABLED } from './params'
import { rideSeries } from './rideUnit'
import { planted, silence, within, quantile } from './test/episodeSim'
import { rideLibrary } from './test/rideSim'
import { sigmaAt } from './windows'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The gate for RIDE_FITNESS_ENABLED: the ride unit runs the run monitor, so it has to hold its silence and see a loss at the
 * spreads of a measured-power ride, which the research put at 2.4% to 4.5% a ride (a power meter's five-minute blocks have no
 * steadiness test, so a ride is noisier than a run). Two layers, as for runs: the monitor on ride values drawn at those spreads,
 * and the unit, the fit and the monitor together on digests of rides with block noise, a ride's day and wander.
 */
describe('the flag', () => {
  it('is on only because these sims pass', () => {
    expect(RIDE_FITNESS_ENABLED).toBe(true)
  })
})

const SPREADS = [0.024, 0.037, 0.045]

describe('the monitor on ride values at the research spreads, one to three rides a week', () => {
  // Observed (three years, 80 libraries): quiet alarms an athlete-year 0.06 to 0.15; with a 3% wander and a 1.5% season 0.23 to 0.53.
  it.each(SPREADS)('stays under the budget when nothing changes, at %s a ride', (runSd) => {
    for (const perWeek of [1, 2, 3]) {
      const quiet = silence({ runSd }, 60, 3, perWeek)
      expect(quiet.alarms).toBeLessThan(0.25)
      expect(quiet.endingNotHolding).toBeLessThan(0.2)
      const stressed = silence({ runSd, wanderSd: 0.03, seasonal: 0.015 }, 60, 3, perWeek)
      expect(stressed.alarms).toBeLessThan(0.65)
    }
  })

  // Observed an 8% loss: median 4 to 9 weeks, 85% to 97% within 26; a 5% loss that stays: median 7 to 24 weeks, 52% to 78% within 26.
  it.each(SPREADS)('sees a loss of 8% at %s a ride, and keeps it open', (runSd) => {
    const two = planted({ size: -0.08, perWeek: 2, runSd }, 100)
    expect(quantile(two.lags, 0.5)).toBeLessThanOrEqual(8)
    expect(within(two.lags, 26)).toBeGreaterThanOrEqual(0.88)
    expect(two.open / two.seen).toBeGreaterThanOrEqual(0.9)
    const one = planted({ size: -0.08, perWeek: 1, runSd }, 100)
    expect(within(one.lags, 26)).toBeGreaterThanOrEqual(0.78)
  })

  it.each(SPREADS)('sees a loss of 5% that stays, at two rides a week and %s a ride', (runSd) => {
    const two = planted({ size: -0.05, perWeek: 2, runSd }, 100)
    expect(within(two.lags, 40)).toBeGreaterThanOrEqual(0.65)
    expect(two.open / two.seen).toBeGreaterThanOrEqual(0.88)
  })
})

describe('rides as digests, through the unit, the fit and the monitor', () => {
  const NONE: ReadonlySet<string> = new Set()
  const NOISES = [
    { rideSd: 0.012, blockSd: 0.025, spread: [0.02, 0.032] },
    { rideSd: 0.02, blockSd: 0.035, spread: [0.03, 0.04] },
    { rideSd: 0.027, blockSd: 0.045, spread: [0.04, 0.05] },
  ] as const
  const status = (digests: ReturnType<typeof rideLibrary>) =>
    fitnessStatuses(digests, NONE, { enabled: { ride: true } }).ride

  it.each(NOISES)(
    'the generator is at the spread of a measured-power ride: $rideSd, $blockSd',
    (noise) => {
      const series = rideSeries(
        rideLibrary({ weeks: 130, perWeek: 2, seed: 1, ...noise }),
        'ride',
        NONE,
      )
      const runs = series.points.map((p) => ({ id: p.id, t: p.startMs / 86_400_000, x: p.x }))
      const spread = sigmaAt(runs, runs.at(-1)!.t + 1)
      expect(spread).toBeGreaterThan(noise.spread[0])
      expect(spread).toBeLessThan(noise.spread[1])
    },
  )

  // Observed over 40 libraries of two years and a half at two rides a week: 5% to 15% in a slipping, holding-below, recovering or back state when nothing changed; an 8% loss
  // 25 weeks before the end is slipping or holding below with its range clear of zero in 93% to 98%.
  it.each(NOISES)(
    'stays holding when nothing changes and sees an 8% loss: $rideSd, $blockSd',
    (noise) => {
      let notHolding = 0
      let seen = 0
      const libraries = 40
      for (let seed = 1; seed <= libraries; seed++) {
        const spec = { weeks: 130, perWeek: 2, seed, ...noise } as const
        const quiet = status(rideLibrary(spec))
        if (['slipping', 'holding-below', 'recovering', 'back'].includes(quiet.state)) notHolding++
        const lost = status(rideLibrary({ ...spec, planted: (w) => (w >= 105 ? -0.08 : 0) }))
        if (
          (lost.state === 'slipping' || lost.state === 'holding-below') &&
          lost.change !== null &&
          lost.change.high < 0
        ) {
          seen++
        }
      }
      expect(notHolding / libraries).toBeLessThanOrEqual(0.2)
      expect(seen / libraries).toBeGreaterThanOrEqual(0.8)
    },
  )
})
