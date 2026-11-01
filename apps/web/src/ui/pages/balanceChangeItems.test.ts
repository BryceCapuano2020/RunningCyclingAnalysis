import '../../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { equivalenceFor } from '@rca/core/pipeline'
import type { SportCurves } from '@rca/core/types'
import { AnalysisSession } from '@rca/core/session'
import type { BalanceGap } from '../balanceGap'
import { gapOfHeadline } from '../balanceGap'
import type { ChangeVerdict } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'
import { changeOf } from '../charts/changeFixtures'
import { headlineGrades } from '../grades'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { TAG_TEXT, balanceChanges, leanItem, noChangeText, previousGap } from './balanceChangeItems'
import type { ChangesInput } from './balanceChangeItems'

const gap = (centre: number, low: number, high: number): BalanceGap => ({
  centre,
  low,
  high,
  lean: centre > 2 ? 'run' : centre < -2 ? 'ride' : 'even',
})

/** The verdicts of a run and a ride best that explain a lean moving from `before` to `now`: the run higher, or lower, alone. */
function explaining(now: BalanceGap, before: BalanceGap): Record<Sport, ChangeVerdict> {
  return { run: now.centre > before.centre ? 'higher' : 'lower', ride: 'none' }
}

/** The lean item for a move that a called best explains. */
const lean = (now: BalanceGap, before: BalanceGap) => leanItem(now, before, explaining(now, before))

describe('leanItem', () => {
  it('says the lean eased, tagged as an estimate, with where it was and no range', () => {
    const item = lean(gap(6, 1, 12), gap(20, 14, 26))
    expect(item).toMatchObject({
      key: 'lean',
      title: 'Lean eased 14 pts',
      direction: 'down',
      tag: 'estimated',
    })
    expect(item?.body).toBe('Down from 20 pts toward running.')
    expect(Object.values(TAG_TEXT).join(' ')).not.toMatch(/range|real change/i)
  })

  describe('which moves the change test supports', () => {
    const now = gap(6, 1, 12)
    const before = gap(20, 14, 26)
    // Easing from 20 to 6 points toward running is a move toward cycling.
    it('lists a move toward cycling when the run’s best was called lower or the ride’s higher', () => {
      expect(leanItem(now, before, { run: 'lower', ride: 'none' })).not.toBeNull()
      expect(leanItem(now, before, { run: 'none', ride: 'higher' })).not.toBeNull()
    })

    it('lists nothing when no best was called, or the called best moves the lean the other way', () => {
      expect(leanItem(now, before, { run: 'none', ride: 'none' })).toBeNull()
      expect(leanItem(now, before, { run: 'untested', ride: 'untested' })).toBeNull()
      expect(leanItem(now, before, { run: 'higher', ride: 'none' })).toBeNull()
      expect(leanItem(now, before, { run: 'none', ride: 'lower' })).toBeNull()
    })

    it('lists a move either way when both bests were called in opposite ways', () => {
      expect(leanItem(now, before, { run: 'higher', ride: 'higher' })).not.toBeNull()
      expect(leanItem(before, now, { run: 'higher', ride: 'higher' })).not.toBeNull()
    })
  })

  it('says the lean grew, with an arrow up, when the gap widened', () => {
    expect(lean(gap(12, 5, 19), gap(6, 1, 11))).toMatchObject({
      title: 'Lean grew 6 pts',
      direction: 'up',
    })
  })

  describe('for a lean toward cycling', () => {
    it('says where it was, toward cycling, and leaves the range to the meter', () => {
      const item = lean(gap(-6, -12, -1), gap(-9, -14, -3))
      expect(item?.body).toBe('Down from 9 pts toward cycling.')
      expect(item?.body).not.toMatch(/range|−/)
    })

    it('points the arrow down when the lean eased and up when it grew, whichever sport it favours', () => {
      expect(lean(gap(-6, -12, -1), gap(-9, -14, -3))).toMatchObject({
        title: 'Lean eased 3 pts',
        direction: 'down',
      })
      expect(lean(gap(-12, -18, -6), gap(-6, -12, -1))).toMatchObject({
        title: 'Lean grew 6 pts',
        direction: 'up',
      })
      // The same easing for running reads the same way.
      expect(lean(gap(6, 1, 12), gap(9, 3, 15))?.direction).toBe('down')
    })
  })

  it('names the new side when the lean crossed over, with the arrow for how far it moved', () => {
    const item = lean(gap(-6, -12, -1), gap(8, 2, 14))
    expect(item?.title).toBe('Lean moved toward cycling')
    expect(item?.body).toBe('Was 8 pts toward running.')
    expect(item?.direction).toBe('down')
  })

  it('says where the lean was, with no range, whether or not the range is one value', () => {
    const item = lean(gap(3, 3, 3), gap(9, 9, 9))
    expect(item?.body).toBe('Down from 9 pts toward running.')
    expect(item?.body).not.toMatch(/range|0 to 0|9 to 9/)
    expect(item?.tag).toBe('estimated')
    expect(lean(gap(-6, -6, -6), gap(1, 1, 1))?.body).not.toMatch(/range/)
  })

  it('says still in balance, not that the lean moved, between two readings both inside the level band', () => {
    // +2 and -2 both read as level, though they round to opposite sides.
    const item = lean(gap(-2, -8, 4), gap(2, -4, 8))
    expect(item?.title).toBe('Still in balance')
    // A reading outside the band is a move.
    expect(lean(gap(-6, -9, -3), gap(2, -4, 8))?.title).toBe('Lean moved toward cycling')
  })

  it('lists nothing when the gap is the same in whole points', () => {
    expect(lean(gap(6.2, 1, 12), gap(5.8, 2, 11))).toBeNull()
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
    change: changeOf('higher'),
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
    const run = balanceChanges(input(scaled(1.05, 1), { change: changeOf('lower') }))?.items.find(
      (item) => item.key === 'run-best',
    )
    expect(run).toMatchObject({
      title: 'Slower 20 min run than the previous 12 weeks',
      direction: 'down',
      tag: 'recorded',
    })
  })

  it('lists a best only where the change test calls it: a move it does not call is no clear change', () => {
    const { input, scaled } = measured()
    // The figures differ by 5%, but the test puts that inside what chance does between the two periods.
    const none = balanceChanges(input(scaled(0.95, 0.95), { change: changeOf('none') }))
    expect(none).toEqual({ items: [] })
    // Called, the same figures list both bests.
    const clear = balanceChanges(input(scaled(0.95, 0.95)))
    expect(clear?.items.map((item) => item.key).sort()).toEqual(['ride-best', 'run-best'])
  })

  it('compares nothing where the test could not judge the 20 minutes in either sport', () => {
    const { input, scaled } = measured()
    const out = balanceChanges(input(scaled(0.9, 0.9), { change: changeOf('untested') }))
    expect(out).toBeNull()
  })

  it('judges each sport by its own call', () => {
    const { input, scaled } = measured()
    const change = changeOf('higher')
    change.ride = changeOf('none').ride
    const out = balanceChanges(input(scaled(0.9, 0.9), { change }))
    expect(out?.items.map((item) => item.key)).toEqual(['run-best'])
  })

  it('gets the direction of a best from the figures, not from the words written for it', () => {
    const { input, scaled } = measured()
    const up = balanceChanges(input(scaled(1, 0.9)))?.items.find((item) => item.key === 'ride-best')
    const down = balanceChanges(input(scaled(1, 1.1), { change: changeOf('lower') }))?.items.find(
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

  it('tags it estimated where the current best’s watts were estimated', () => {
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
    expect(ride?.body).toMatch(/^\d+ W, \d+ W more than previous 12 weeks\./)
  })

  it('leaves the ride out while no weight is entered, since a ride’s figures wait for it', () => {
    const { input, scaled } = sample()
    const items = balanceChanges(input(scaled(1, 0.9), { rideShown: false }))?.items
    expect(items?.some((item) => item.key === 'ride-best')).toBe(false)
  })

  it('says nothing changed, having compared, when the bests are the same as the page shows them', () => {
    const { input, scaled } = sample()
    expect(balanceChanges(input(scaled(1, 1), { change: changeOf('none') }))).toEqual({ items: [] })
    expect(noChangeText('Previous 12 weeks')).toBe('No clear change from the previous 12 weeks.')
  })

  it('is null, so the strip is absent and says nothing, when the previous period lacks the efforts', () => {
    const { input } = sample()
    expect(balanceChanges(input({ runCurve: [], rideCurve: [] }))).toBeNull()
  })

  it('names an earlier window by its months, in each title, line and the no-change text', () => {
    const { input, scaled } = measured()
    const items = balanceChanges(input(scaled(0.95, 0.9), { previousLabel: 'Jan to Mar' }))?.items
    expect(items?.find((item) => item.key === 'run-best')).toMatchObject({
      title: 'Faster 20 min run than Jan to Mar',
    })
    expect(items?.find((item) => item.key === 'run-best')?.body).toMatch(
      /faster than Jan to Mar\. Set on /,
    )
    expect(items?.find((item) => item.key === 'ride-best')?.title).toBe(
      'More power over 20 min than Jan to Mar',
    )
    expect(noChangeText('Jan to Mar')).toBe('No clear change from Jan to Mar.')
    expect(
      balanceChanges(
        input(scaled(0.95, 0.9), { previousLabel: 'Jan to Mar', change: changeOf('none') }),
      ),
    ).toEqual({ items: [] })
  })

  it('lists only what could be compared when the previous period has one sport’s best', () => {
    const { input, scaled } = sample()
    const half = { ...scaled(0.95, 1), rideCurve: [] }
    const result = balanceChanges(input(half))
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

describe('balanceChanges for a library that fails the hard-effort check', () => {
  /** An effort check at the headline duration, by each sport's share of its reference heart rate. */
  const check = (run: number | null, ride: number | null) => ({
    durationS: 1200,
    runHrFraction: run,
    rideHrFraction: ride,
    runReference: 'trusted' as const,
    rideReference: 'trusted' as const,
  })
  const keys = (out: ReturnType<typeof balanceChanges>) => out?.items.map((item) => item.key)

  it('lists a best the change test calls, whether or not either period’s best was a hard effort', () => {
    const { input, scaled, result } = measured()
    // Both periods' bests are shown easy by a reference that can say so: the test alone decides.
    const easy = { ...result, effort: [check(0.6, 0.6)] }
    const previous = { ...scaled(0.95, 0.9), headlineEffort: check(0.6, 0.6) }
    expect(keys(balanceChanges(input(previous, { result: easy })))).toEqual([
      'ride-best',
      'run-best',
    ])
    // One period easy and the other hard is the same.
    const mixed = { ...scaled(0.95, 0.9), headlineEffort: check(0.95, 0.95) }
    expect(keys(balanceChanges(input(mixed, { result: easy })))).toEqual(['ride-best', 'run-best'])
  })

  it('gives only its items: no line about a best that was not hard, or an effort that was not checked', () => {
    const { input, scaled, result } = measured()
    const easy = { ...result, effort: [check(0.6, 0.6)] }
    const change = changeOf('higher')
    // The call read every effort in both periods, because too few were shown hard.
    change.run = change.run.map((call) => ({ ...call, gated: false }))
    const out = balanceChanges(
      input({ ...scaled(0.95, 0.9), headlineEffort: check(0.6, 0.6) }, { result: easy, change }),
    )
    expect(Object.keys(out ?? {})).toEqual(['items'])
    expect(JSON.stringify(out)).not.toMatch(/hard effort|comparable|not checked|every effort/i)
  })

  it('lists a called best that moves the lean, and the lean with it, from an easy previous best', () => {
    const { input, scaled, grading, result } = sample()
    const nowGap = previousGap(result, scaled(1, 1), grading)
    // The ride was weaker the period before, so the lean has eased toward cycling; the run's lower call explains that.
    const change = changeOf('lower')
    change.ride = changeOf('none').ride
    const easyBefore = {
      ...scaled(1.05, 0.8),
      headlineEffort: { durationS: 1200, runHrFraction: 0.6, rideHrFraction: 0.6 },
    }
    const easy = { ...result, effort: [check(0.6, 0.6)] }
    const out = balanceChanges(input(easyBefore, { result: easy, gap: nowGap, grading, change }))
    expect(keys(out)).toContain('lean')
    expect(keys(out)).toContain('run-best')
  })

  it('is absent, with no text, when neither sport could be tested', () => {
    const { input, scaled } = measured()
    expect(balanceChanges(input(scaled(0.9, 0.9), { change: changeOf('untested') }))).toBeNull()
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

describe('balanceChanges: direction, level and the lean', () => {
  it('takes a best’s direction from the call, not the shown watts: the same watts at a lower weight is up', () => {
    const { input, scaled } = measured()
    // The previous ride is the same watts as now; the call, in watts per kilogram, says higher.
    const ride = balanceChanges(input(scaled(1, 1)))?.items.find((item) => item.key === 'ride-best')
    expect(ride).toMatchObject({
      direction: 'up',
      title: 'More power over 20 min than the previous 12 weeks',
    })
    expect(ride?.body).toMatch(/8% more power per kilogram than previous 12 weeks/)
    // And the call saying lower reads down, with the same watts.
    const down = balanceChanges(input(scaled(1, 1), { change: changeOf('lower') }))?.items.find(
      (item) => item.key === 'ride-best',
    )
    expect(down).toMatchObject({ direction: 'down' })
  })

  it('holds the strip to the stricter band: a call that leaves only the record band lists nothing', () => {
    const { input, scaled } = measured()
    const weak = changeOf('higher', {}, { weak: true })
    const out = balanceChanges(input(scaled(0.95, 0.95), { change: weak }))
    expect(out).toEqual({ items: [] })
  })
})
