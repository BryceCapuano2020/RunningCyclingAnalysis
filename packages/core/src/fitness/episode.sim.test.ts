import { describe, expect, it, vi } from 'vitest'
import { NUISANCES, afterDips, planted, quantile, silence, within } from './test/episodeSim'
import type { Silence } from './test/episodeSim'
import { LEGACY, withParams } from './test/legacyParams'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The silence budget and the persistence of an episode, on the run-level generator (AR(1) wander, a season, a watch
 * or strap step, heat, hills and bad runs): how often a library where nothing changes is told it is slipping, how
 * often it ends the five years on a state that is not holding, and what the same machinery does with a planted loss
 * that stays, one that is partly regained and one that is fully regained. Every case runs twice, with the parameters as
 * they stood before the episode work (LEGACY) and as they are, so a budget says how far the change moved it. The
 * values are recorded in docs/design/fitness.md.
 */
const LIBRARIES = 60
const PLANTED_LIBRARIES = 200

const cache = new Map<string, { legacy: Silence; now: Silence }>()
function both(name: keyof typeof NUISANCES) {
  let found = cache.get(name)
  if (found === undefined) {
    const spec = NUISANCES[name]
    found = {
      legacy: withParams(LEGACY, () => silence(spec, LIBRARIES)),
      now: silence(spec, LIBRARIES),
    }
    cache.set(name, found)
  }
  return found
}

describe('libraries where nothing changes, five years at three steady runs a week', () => {
  it('keeps the budget of a quarter of an alarm an athlete-year for the quiet athlete, and ends mostly holding', () => {
    const { now } = both('quiet')
    // Observed 0.16 and 15% ending not holding (0.22 and 26% before).
    expect(now.alarms).toBeLessThan(0.25)
    expect(now.endingNotHolding).toBeLessThan(0.25)
  })

  // Observed (before -> now): alarms and the share ending not holding.
  //   season 1.5%    0.43 -> 0.24   53% -> 23%
  //   season 3%      0.83 -> 0.44   90% -> 28%
  //   wander 3%      0.46 -> 0.38   61% -> 46%
  //   strap 3%       0.32 -> 0.25   45% -> 27%
  //   all at once    0.64 -> 0.47   82% -> 54%
  it.each([
    ['a season of 1.5%', 0.35],
    ['a season of 3%', 0.55],
    ['a slow wander of 3%', 0.45],
    ['a watch or strap change of 3%', 0.33],
    ['every nuisance at once', 0.55],
  ] as const)('falls materially and stays under budget through %s', (name, budget) => {
    const { legacy, now } = both(name)
    expect(now.alarms).toBeLessThan(budget)
    expect(now.alarms).toBeLessThan(0.85 * legacy.alarms)
    expect(now.endingNotHolding).toBeLessThan(0.8 * legacy.endingNotHolding)
    expect(now.weeksNotHolding).toBeLessThan(0.9 * legacy.weeksNotHolding)
  })

  it('does not hand an episode it closed straight back to the slip test: few closes re-open within half a year', () => {
    // Observed: 0% to 25% of the episodes that closed as holding were followed by a new slip within 26 weeks (the slow wander the most).
    for (const name of Object.keys(NUISANCES) as (keyof typeof NUISANCES)[]) {
      const { now } = both(name)
      expect(now.closes).toBeGreaterThan(0)
      expect(now.closeReopen, name).toBeLessThanOrEqual(0.4)
    }
  })

  it('reproduces the figures recorded for main before the change', () => {
    // The legacy parameters are the old detector: 0.25 and 3% season 0.7 to 0.9 were the documented figures.
    expect(both('quiet').legacy.alarms).toBeGreaterThan(0.18)
    expect(both('quiet').legacy.alarms).toBeLessThan(0.3)
    expect(both('a season of 3%').legacy.alarms).toBeGreaterThan(0.65)
  })
})

describe('a planted loss', () => {
  it('after two real dips and returns is seen as fast as for an athlete who never dipped: their weeks are not wander', () => {
    // Observed (300 libraries): a new 8% loss at week 200, median 4 weeks, 94% within 12; a 5% loss median 6, 74% within 12. With the dips read as wander
    // (the learned floor at 3% and no dips left out) the 8% loss took median 9 and 34% were never seen; at 2% and dips in, a 5% loss median 67.
    const eight = afterDips(-0.08, PLANTED_LIBRARIES)
    expect(quantile(eight.lags, 0.5)).toBeLessThanOrEqual(6)
    expect(within(eight.lags, 12)).toBeGreaterThanOrEqual(0.85)
    const five = afterDips(-0.05, PLANTED_LIBRARIES)
    expect(quantile(five.lags, 0.5)).toBeLessThanOrEqual(10)
    expect(within(five.lags, 26)).toBeGreaterThanOrEqual(0.7)
    const wander = withParams({ monitor: { floorSkipDips: 0 } }, () =>
      afterDips(-0.05, PLANTED_LIBRARIES),
    )
    expect(within(five.lags, 26)).toBeGreaterThan(within(wander.lags, 26) + 0.2)
  })

  it('that stays is seen as before and stays open: 8% at three runs a week', () => {
    const was = withParams(LEGACY, () => planted({ size: -0.08 }, PLANTED_LIBRARIES))
    const now = planted({ size: -0.08 }, PLANTED_LIBRARIES)
    // Observed: median 4 weeks (4 before), 92% within 12 (94%), 99% open at the end.
    expect(quantile(now.lags, 0.5)).toBeLessThanOrEqual(quantile(was.lags, 0.5) + 2)
    expect(within(now.lags, 12)).toBeGreaterThanOrEqual(0.85)
    expect(now.open).toBeGreaterThanOrEqual(0.95)
  })

  it('of 5% that stays is seen about three weeks later, and a declared one stays open', () => {
    const was = withParams(LEGACY, () => planted({ size: -0.05 }, PLANTED_LIBRARIES))
    const now = planted({ size: -0.05 }, PLANTED_LIBRARIES)
    // Observed: median 9 weeks (6 before), 60% within 12 (77%), 75% within 26 (88%), 84% seen at all within 70 weeks (95%); 80% still open at the end.
    expect(quantile(now.lags, 0.5)).toBeLessThanOrEqual(quantile(was.lags, 0.5) + 4)
    expect(within(now.lags, 26)).toBeGreaterThanOrEqual(0.65)
    expect(now.seen).toBeGreaterThanOrEqual(0.75)
    expect(now.open / now.seen).toBeGreaterThanOrEqual(0.9)
  })

  it('of 8% that is partly regained, to 5% under the old level, stays open', () => {
    const was = withParams(LEGACY, () => planted({ size: -0.08, back: 0.03 }, PLANTED_LIBRARIES))
    const now = planted({ size: -0.08, back: 0.03 }, PLANTED_LIBRARIES)
    // Observed 87% open at the end (97% before): the rest closed as holding at the level they had, a 5% loss the range no longer rules out.
    expect(was.open).toBeGreaterThanOrEqual(0.9)
    expect(now.open).toBeGreaterThanOrEqual(0.78)
  })

  it('of 8% that is fully regained reaches back as often as before', () => {
    const was = withParams(LEGACY, () => planted({ size: -0.08, back: 0.08 }, PLANTED_LIBRARIES))
    const now = planted({ size: -0.08, back: 0.08 }, PLANTED_LIBRARIES)
    // Observed 82% reach back within a year of the return (76% before); the episode is over (holding) in 77% against 65%.
    expect(now.back).toBeGreaterThanOrEqual(0.7)
    expect(now.back).toBeGreaterThanOrEqual(was.back - 0.06)
    expect(now.open).toBeLessThan(was.open - 0.1)
  })

  it('of 8% at one run a week is seen within a few weeks of before', () => {
    const was = withParams(LEGACY, () => planted({ size: -0.08, perWeek: 1.2 }, PLANTED_LIBRARIES))
    const now = planted({ size: -0.08, perWeek: 1.2 }, PLANTED_LIBRARIES)
    // Observed: median 7 (5 before), 79% within 12 (90%), 94% within 26.
    expect(quantile(now.lags, 0.5)).toBeLessThanOrEqual(quantile(was.lags, 0.5) + 4)
    expect(within(now.lags, 26)).toBeGreaterThanOrEqual(0.88)
  })
})
