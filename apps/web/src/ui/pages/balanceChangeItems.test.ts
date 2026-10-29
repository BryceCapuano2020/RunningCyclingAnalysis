import '../../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { equivalenceFor } from '@rca/core/pipeline'
import type { SportCurves } from '@rca/core/types'
import { AnalysisSession } from '@rca/core/session'
import type { BalanceGap } from '../balanceGap'
import { gapOfHeadline } from '../balanceGap'
import { headlineGrades } from '../grades'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import {
  TAG_TEXT,
  balanceChanges,
  leanItem,
  noChangeText,
  notComparedText,
  previousGap,
  rangeVerdict,
} from './balanceChangeItems'
import type { ChangesInput } from './balanceChangeItems'

const gap = (centre: number, low: number, high: number): BalanceGap => ({
  centre,
  low,
  high,
  lean: centre > 2 ? 'run' : centre < -2 ? 'ride' : 'even',
})

describe('rangeVerdict', () => {
  it('calls ranges that overlap within their range, ends touching included', () => {
    expect(rangeVerdict({ low: 1, high: 12 }, { low: 3, high: 15 })).toBe('within')
    expect(rangeVerdict({ low: 1, high: 12 }, { low: 12, high: 20 })).toBe('within')
    expect(rangeVerdict({ low: 4, high: 8 }, { low: 1, high: 12 })).toBe('within')
  })

  it('calls ranges that do not overlap beyond their range, from either side', () => {
    expect(rangeVerdict({ low: 14, high: 26 }, { low: 1, high: 12 })).toBe('beyond')
    expect(rangeVerdict({ low: 1, high: 12 }, { low: 14, high: 26 })).toBe('beyond')
    expect(rangeVerdict({ low: -12, high: -1 }, { low: 2, high: 9 })).toBe('beyond')
  })

  it('claims nothing where either period has no range, or one of a single value', () => {
    expect(rangeVerdict(null, { low: 1, high: 12 })).toBeNull()
    expect(rangeVerdict({ low: 1, high: 12 }, null)).toBeNull()
    expect(rangeVerdict({ low: 6, high: 6 }, { low: 1, high: 12 })).toBeNull()
    expect(rangeVerdict({ low: 1, high: 12 }, { low: 6, high: 6 })).toBeNull()
  })

  it('does not call a move beyond its range just because the earlier centre left the current range', () => {
    // The earlier centre, 14, is outside the range now (1 to 12), but the two ranges overlap.
    expect(rangeVerdict({ low: 6, high: 22 }, { low: 1, high: 12 })).toBe('within')
  })
})

describe('leanItem', () => {
  it('tags ranges that do not overlap as beyond their range, and says the lean eased', () => {
    const item = leanItem(gap(6, 1, 12), gap(20, 14, 26))
    expect(item).toMatchObject({
      key: 'lean',
      title: 'Lean eased 14 pts',
      direction: 'down',
      tag: 'beyond',
    })
    expect(item?.body).toBe(
      'From 20 pts toward running to 6 pts toward running. 90% range now 1 to 12 points, which does not overlap the earlier range.',
    )
  })

  it('tags ranges that overlap as within their range, and never calls it not a real change', () => {
    const item = leanItem(gap(6, 1, 12), gap(9, 3, 15))
    expect(item).toMatchObject({ title: 'Lean eased 3 pts', tag: 'within' })
    expect(item?.body).toMatch(/which overlaps the earlier range\.$/)
    expect(TAG_TEXT[item!.tag]).toBe('Within its range')
    expect(Object.values(TAG_TEXT).join(' ')).not.toMatch(/real change/)
  })

  it('says the lean grew, with an arrow up, when the gap widened', () => {
    expect(leanItem(gap(12, 5, 19), gap(6, 1, 11))).toMatchObject({
      title: 'Lean grew 6 pts',
      direction: 'up',
    })
  })

  describe('for a lean toward cycling', () => {
    it('writes the range from cycling’s side, as the headline does', () => {
      const item = leanItem(gap(-6, -12, -1), gap(-9, -14, -3))
      expect(item?.body).toContain('90% range now 1 to 12 points')
      expect(item?.body).not.toContain('−')
      expect(item?.body).toMatch(/^From 9 pts toward cycling to 6 pts toward cycling\./)
    })

    it('signs a range that reaches zero, from cycling’s side', () => {
      const item = leanItem(gap(-4, -9, 2), gap(-9, -14, -3))
      expect(item?.body).toContain('90% range now −2 to +9 points')
    })

    it('points the arrow down when the lean eased and up when it grew, whichever sport it favours', () => {
      expect(leanItem(gap(-6, -12, -1), gap(-9, -14, -3))).toMatchObject({
        title: 'Lean eased 3 pts',
        direction: 'down',
      })
      expect(leanItem(gap(-12, -18, -6), gap(-6, -12, -1))).toMatchObject({
        title: 'Lean grew 6 pts',
        direction: 'up',
      })
      // The same easing for running reads the same way.
      expect(leanItem(gap(6, 1, 12), gap(9, 3, 15))?.direction).toBe('down')
    })
  })

  it('names the new side when the lean crossed over, with the arrow for how far it moved', () => {
    const item = leanItem(gap(-6, -12, -1), gap(8, 2, 14))
    expect(item?.title).toBe('Lean moved toward cycling')
    expect(item?.tag).toBe('beyond')
    expect(item?.direction).toBe('down')
  })

  it('claims neither beyond nor within when either estimate has no range, and tags it estimated', () => {
    const item = leanItem(gap(6, 6, 6), gap(9, 3, 15))
    expect(item?.tag).toBe('estimated')
    expect(item?.body).not.toMatch(/overlap/)
    expect(leanItem(gap(6, 1, 12), gap(9, 9, 9))?.tag).toBe('estimated')
  })

  it('writes no range where the range now rounds to one value, and says nothing of a range that is not there', () => {
    const item = leanItem(gap(3, 3, 3), gap(9, 9, 9))
    expect(item?.body).toBe('From 9 pts toward running to 3 pts toward running.')
    expect(item?.body).not.toMatch(/range|0 to 0|9 to 9/)
    expect(item?.tag).toBe('estimated')
    expect(leanItem(gap(-6, -6, -6), gap(1, 1, 1))?.body).not.toMatch(/range/)
  })

  it('says still in balance, not that the lean moved, between two readings both inside the level band', () => {
    // +2 and -2 both read as level, though they round to opposite sides.
    const item = leanItem(gap(-2, -8, 4), gap(2, -4, 8))
    expect(item?.title).toBe('Still in balance')
    // A reading outside the band is a move.
    expect(leanItem(gap(-6, -9, -3), gap(2, -4, 8))?.title).toBe('Lean moved toward cycling')
  })

  it('lists nothing when the gap is the same in whole points', () => {
    expect(leanItem(gap(6.2, 1, 12), gap(5.8, 2, 11))).toBeNull()
  })
})

/** The sample athlete's analysis, with the curves of a previous period made from it. */
function sample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const { result } = state
  if (result === null) throw new Error('The sample has no result')
  const input = (previous: SportCurves | null, over: Partial<ChangesInput> = {}): ChangesInput => ({
    result,
    previous,
    library: state.library,
    previousLabel: 'Previous 12 weeks',
    units: 'metric',
    rideShown: true,
    gap: null,
    grading: null,
    ...over,
  })
  /** The previous period: each curve scaled, so its 20 minute best is that much lower or higher. */
  const scaled = (run: number, ride: number): SportCurves => ({
    runCurve: result.runCurve.map((p) => Object.assign({}, p, { value: p.value * run })),
    rideCurve: result.rideCurve.map((p) => Object.assign({}, p, { value: p.value * ride })),
  })
  const grading = {
    library: state.library,
    profile: SAMPLE_PROFILE,
    massKg: SAMPLE_SETTINGS.massKg,
    calibration: state.heartRateJudgement.calibration,
  }
  return { state, result, input, scaled, grading }
}

/** A library whose rides' watts were all measured by a power meter, and the result's with them. */
function measured(): ReturnType<typeof sample> {
  const base = sample()
  const withMeter = (activities: readonly ActivitySummary[]) =>
    activities.map((activity) => Object.assign({}, activity, { powerSource: 'measured' as const }))
  const result = { ...base.result, activities: withMeter(base.result.activities) }
  const library = withMeter(base.state.library)
  return {
    ...base,
    result,
    input: (previous, over = {}) => base.input(previous, { result, library, ...over }),
  }
}

describe('balanceChanges', () => {
  it('is null with no previous period, as under all time, so the strip is left out', () => {
    const { input } = sample()
    expect(balanceChanges(input(null))).toBeNull()
    expect(balanceChanges({ ...input(null), previousLabel: null })).toBeNull()
  })

  it('says a faster 20 min run than the period before, recorded, with the pace and the day it was set', () => {
    const { input, scaled } = measured()
    const items = balanceChanges(input(scaled(0.95, 1)))?.items
    const run = items?.find((item) => item.key === 'run-best')
    expect(run).toMatchObject({
      title: 'Faster 20 min run than the previous 12 weeks',
      direction: 'up',
      tag: 'recorded',
    })
    expect(run?.body).toMatch(/faster than previous 12 weeks\. Set on /)
    expect(TAG_TEXT.recorded).toBe('Recorded')
  })

  it('says a slower 20 min run is down, and still recorded: both bests were measured', () => {
    const { input, scaled } = measured()
    const run = balanceChanges(input(scaled(1.05, 1)))?.items.find(
      (item) => item.key === 'run-best',
    )
    expect(run).toMatchObject({
      title: 'Slower 20 min run than the previous 12 weeks',
      direction: 'down',
      tag: 'recorded',
    })
  })

  it('lists a best only where the curve would call it a change: a move under the floor is no clear change', () => {
    const { input, scaled } = measured()
    // 0.1% of a pace is well under the curve's floor of 1% and 2 s/km, and of 1% and 2 W for watts.
    const tiny = balanceChanges(input(scaled(0.999, 0.999)))
    expect(tiny?.items.map((item) => item.key)).toEqual([])
    expect(tiny?.compared).toBe(true)
    // 5% is a change on both, so the strip lists both bests.
    const clear = balanceChanges(input(scaled(0.95, 0.95)))
    expect(clear?.items.map((item) => item.key).sort()).toEqual(['ride-best', 'run-best'])
  })

  it('gets the direction of a best from the figures, not from the words written for it', () => {
    const { input, scaled } = measured()
    const up = balanceChanges(input(scaled(1, 0.9)))?.items.find((item) => item.key === 'ride-best')
    const down = balanceChanges(input(scaled(1, 1.1)))?.items.find(
      (item) => item.key === 'ride-best',
    )
    expect([up?.direction, down?.direction]).toEqual(['up', 'down'])
    expect(up?.title).toBe('More power over 20 min than the previous 12 weeks')
    expect(down?.title).toBe('Less power over 20 min than the previous 12 weeks')
  })

  it('tags a ride’s best recorded only when the watts were measured in both periods', () => {
    const { input, scaled, result, state } = measured()
    const ride = (previous: SportCurves, over: Partial<ChangesInput> = {}) =>
      balanceChanges(input(previous, over))?.items.find((item) => item.key === 'ride-best')
    expect(ride(scaled(1, 0.95))?.tag).toBe('recorded')

    // The previous period's best was set on a ride whose watts were virtual: only the earlier one is estimated.
    const earlier = {
      ...state.library.find((a) => a.sport === 'ride')!,
      id: 'ride-before',
      powerSource: 'virtual' as const,
    }
    const library = [...result.activities, earlier]
    const before = scaled(1, 0.95)
    const previous = {
      ...before,
      rideCurve: before.rideCurve.map((point) =>
        Object.assign({}, point, { activityId: 'ride-before' }),
      ),
    }
    expect(ride(previous, { library })?.tag).toBe('estimated')
  })

  it('tags it estimated where the current best’s watts were estimated, and claims no range', () => {
    const { input, scaled, result, state } = sample()
    const virtual = (activities: readonly ActivitySummary[]) =>
      activities.map((a) => Object.assign({}, a, { powerSource: 'virtual' as const }))
    const ride = balanceChanges(
      input(scaled(1, 0.95), {
        result: { ...result, activities: virtual(result.activities) },
        library: virtual(state.library),
      }),
    )?.items.find((item) => item.key === 'ride-best')
    expect(ride?.tag).toBe('estimated')
    expect(['beyond', 'within']).not.toContain(ride?.tag)
    expect(ride?.body).toMatch(/^\d+ W, \d+ W more than previous 12 weeks\./)
  })

  it('leaves the ride out while no weight is entered, since a ride’s figures wait for it', () => {
    const { input, scaled } = sample()
    const items = balanceChanges(input(scaled(1, 0.9), { rideShown: false }))?.items
    expect(items?.some((item) => item.key === 'ride-best')).toBe(false)
  })

  it('says nothing changed, having compared, when the bests are the same as the page shows them', () => {
    const { input, scaled } = sample()
    expect(balanceChanges(input(scaled(1, 1)))).toEqual({ items: [], notes: [], compared: true })
    expect(noChangeText('Previous 12 weeks')).toBe('No clear change since the previous 12 weeks.')
  })

  it('says there is not enough to compare, apart from nothing changing, when the previous period lacks the efforts', () => {
    const { input } = sample()
    const nothing = balanceChanges(input({ runCurve: [], rideCurve: [] }))
    expect(nothing).toEqual({ items: [], notes: [], compared: false })
    expect(notComparedText('Previous 12 weeks')).toBe(
      'Not enough in the previous 12 weeks to compare.',
    )
  })

  it('lists only what could be compared when the previous period has one sport’s best', () => {
    const { input, scaled } = sample()
    const half = { ...scaled(0.95, 1), rideCurve: [] }
    const result = balanceChanges(input(half))
    expect(result?.compared).toBe(true)
    expect(result?.items.map((item) => item.key)).toEqual(['run-best'])
  })

  it('lists the lean first, then the ride’s best, then the run’s, and never more than four', () => {
    const { input, scaled, grading, result } = sample()
    const now = previousGap(result, scaled(1, 1), grading)
    expect(now).not.toBeNull()
    const out = balanceChanges(input(scaled(0.9, 0.8), { gap: now, grading }))
    expect(out?.items.map((item) => item.key)).toEqual(['lean', 'ride-best', 'run-best'])
    expect(out?.items.length).toBeLessThanOrEqual(4)
  })
})

describe('balanceChanges and how hard the bests were', () => {
  /** An effort check at the headline duration, by each sport's share of its reference heart rate. */
  const check = (run: number | null, ride: number | null) => ({
    durationS: 1200,
    runHrFraction: run,
    rideHrFraction: ride,
  })
  const runBest = (out: ReturnType<typeof balanceChanges>) =>
    out?.items.find((item) => item.key === 'run-best')

  it('compares a best with the period before when both were hard efforts', () => {
    const { input, scaled, result } = measured()
    const hard = { ...result, effort: [check(0.95, 0.95)] }
    const previous = { ...scaled(0.95, 1), headlineEffort: check(0.93, 0.93) }
    const out = balanceChanges(input(previous, { result: hard }))
    expect(runBest(out)).toBeDefined()
    expect(out?.notes).toEqual([])
  })

  it('says there is no comparable hard effort, and lists no change, when the previous best was easy', () => {
    const { input, scaled, result } = measured()
    const hard = { ...result, effort: [check(0.95, 0.95)] }
    const previous = { ...scaled(0.95, 1), headlineEffort: check(0.7, 0.95) }
    const out = balanceChanges(input(previous, { result: hard }))
    expect(runBest(out)).toBeUndefined()
    expect(out?.notes).toEqual(['No comparable hard 20 min of running in the previous 12 weeks.'])
    // The ride's bests were both hard, so it is still compared.
    expect(out?.items.some((item) => item.key === 'ride-best')).toBe(false)
    expect(out?.compared).toBe(true)
  })

  it('says so, in its own words, when this period’s best was the easy one', () => {
    const { input, scaled, result } = measured()
    const easy = { ...result, effort: [check(0.6, 0.95)] }
    const previous = { ...scaled(0.95, 0.9), headlineEffort: check(0.95, 0.95) }
    const out = balanceChanges(input(previous, { result: easy }))
    expect(runBest(out)).toBeUndefined()
    expect(out?.notes).toEqual([
      'Your best 20 min of running in this period was not a hard effort, so it is not compared.',
    ])
    expect(out?.items.some((item) => item.key === 'ride-best')).toBe(true)
  })

  it('judges each sport on its own heart rate, so an easy ride leaves the run compared', () => {
    const { input, scaled, result } = measured()
    const mixed = { ...result, effort: [check(0.95, 0.95)] }
    const previous = { ...scaled(0.95, 0.9), headlineEffort: check(0.95, 0.6) }
    const out = balanceChanges(input(previous, { result: mixed }))
    expect(runBest(out)).toBeDefined()
    expect(out?.items.some((item) => item.key === 'ride-best')).toBe(false)
    expect(out?.notes).toEqual(['No comparable hard 20 min of cycling in the previous 12 weeks.'])
  })

  it('still compares where heart rate does not say, since nothing shows a best was easy', () => {
    const { input, scaled, result } = measured()
    const none = { ...result, effort: [check(null, null)] }
    const out = balanceChanges(
      input({ ...scaled(0.95, 1), headlineEffort: check(null, null) }, { result: none }),
    )
    expect(runBest(out)).toBeDefined()
    expect(out?.notes).toEqual([])
  })
})

describe('previousGap', () => {
  it('is the page’s own gap when the previous curves are this period’s: centre, low and high', () => {
    const { result, scaled, grading } = sample()
    const same = previousGap(result, scaled(1, 1), grading)
    const page = gapOfHeadline(headlineGrades(result, SAMPLE_PROFILE))
    expect(same).not.toBeNull()
    expect(same?.centre).toBe(page?.centre)
    expect(same?.low).toBe(page?.low)
    expect(same?.high).toBe(page?.high)
  })

  it('widens the run’s lead when the ride was weaker the period before', () => {
    const { result, scaled, grading } = sample()
    const same = previousGap(result, scaled(1, 1), grading)
    const slower = previousGap(result, scaled(1, 0.85), grading)
    expect((slower?.centre ?? 0) > (same?.centre ?? 0)).toBe(true)
  })

  it('prices the ride at the mass it was ridden at, not the body mass today', () => {
    const { result, state, scaled, grading } = sample()
    const previous = scaled(1, 1)
    const rideId = previous.rideCurve.find((p) => p.durationS === 1200)?.activityId
    const heavier = state.library.map((a) =>
      a.id === rideId ? Object.assign({}, a, { massKg: 95 }) : a,
    )
    const atHeavier = previousGap(result, previous, { ...grading, library: heavier })
    const watts = previous.rideCurve.find((p) => p.durationS === 1200)?.value ?? 0
    const expected = gapOfHeadline(
      headlineGrades(
        {
          ...result,
          activities: heavier,
          equivalents: [
            {
              durationS: 1200,
              ridePowerW: watts,
              runSpeed: equivalenceFor(grading.calibration)(watts, 95),
            },
          ],
        },
        SAMPLE_PROFILE,
      ),
    )
    expect(atHeavier?.centre).toBe(expected?.centre)
    expect(atHeavier?.low).toBe(expected?.low)
    expect(atHeavier?.high).toBe(expected?.high)
    // At the heavier mass the same watts are worth a slower run, so the lead differs from the body mass's.
    const atBody = previousGap(result, previous, grading)
    expect(atHeavier?.centre).not.toBe(atBody?.centre)
  })

  it('is null when a sport has no best at the headline duration in the previous period', () => {
    const { result, grading } = sample()
    expect(previousGap(result, { runCurve: [], rideCurve: result.rideCurve }, grading)).toBeNull()
  })
})
