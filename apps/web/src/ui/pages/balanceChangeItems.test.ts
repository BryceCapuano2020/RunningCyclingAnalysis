import '../../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { SportCurves } from '@rca/core/types'
import { AnalysisSession } from '@rca/core/session'
import { changeOf } from '../charts/changeFixtures'
import { SAMPLE_SETTINGS } from '../sampleAthlete'
import { balanceChanges, noChangeText } from './balanceChangeItems'
import type { ChangesInput } from './balanceChangeItems'

/** The sample athlete's analysis, with the curves of a previous period made from it. */
function sample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const { result } = state
  if (result === null) throw new Error('The sample has no result')
  const input = (previous: SportCurves | null, over: Partial<ChangesInput> = {}): ChangesInput => ({
    result,
    previous,
    previousLabel: 'Previous 12 weeks',
    change: changeOf('higher'),
    units: 'metric',
    rideShown: true,
    ...over,
  })
  /** The previous period: each curve scaled, so its 20 minute best is that much lower or higher. */
  const scaled = (run: number, ride: number): SportCurves => ({
    runCurve: result.runCurve.map((p) => Object.assign({}, p, { value: p.value * run })),
    rideCurve: result.rideCurve.map((p) => Object.assign({}, p, { value: p.value * ride })),
  })
  return { state, result, input, scaled }
}

/** A result whose rides' watts were all measured by a power meter. */
function measured(): ReturnType<typeof sample> {
  const base = sample()
  const withMeter = (activities: readonly ActivitySummary[]) =>
    activities.map((activity) => Object.assign({}, activity, { powerSource: 'measured' as const }))
  const result = { ...base.result, activities: withMeter(base.result.activities) }
  return {
    ...base,
    result,
    input: (previous, over = {}) => base.input(previous, { result, ...over }),
  }
}

describe('balanceChanges', () => {
  it('is null with no previous period, as under all time, so the strip is left out', () => {
    const { input } = sample()
    expect(balanceChanges(input(null))).toBeNull()
    expect(balanceChanges({ ...input(null), previousLabel: null })).toBeNull()
  })

  it('says a faster 20 min run than the period before, with the pace and the day it was set', () => {
    const { input, scaled } = measured()
    const items = balanceChanges(input(scaled(0.95, 1)))?.items
    const run = items?.find((item) => item.key === 'run-best')
    expect(run).toMatchObject({
      title: 'Faster 20 min run than the previous 12 weeks',
      direction: 'up',
    })
    expect(run?.body).toMatch(/faster than previous 12 weeks\. Set on /)
  })

  it('says a slower 20 min run is down', () => {
    const { input, scaled } = measured()
    const run = balanceChanges(input(scaled(1.05, 1), { change: changeOf('lower') }))?.items.find(
      (item) => item.key === 'run-best',
    )
    expect(run).toMatchObject({
      title: 'Slower 20 min run than the previous 12 weeks',
      direction: 'down',
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

  it('lists a ride best on estimated watts as it lists a measured one: the same fields, no tag', () => {
    const { input, scaled, result } = sample()
    const virtual = (activities: readonly ActivitySummary[]) =>
      activities.map((a) => Object.assign({}, a, { powerSource: 'virtual' as const }))
    const ride = balanceChanges(
      input(scaled(1, 0.95), { result: { ...result, activities: virtual(result.activities) } }),
    )?.items.find((item) => item.key === 'ride-best')
    expect(Object.keys(ride ?? {}).sort()).toEqual(['body', 'direction', 'key', 'title'])
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
    expect(noChangeText('Previous 12 weeks')).toBe(
      'No clear change at 20 min from the previous 12 weeks.',
    )
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
    expect(noChangeText('Jan to Mar')).toBe('No clear change at 20 min from Jan to Mar.')
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

  it('lists the ride’s best, then the run’s, and never the lean: the lead of the page states that once', () => {
    const { input, scaled } = sample()
    const out = balanceChanges(input(scaled(0.9, 0.8)))
    expect(out?.items.map((item) => item.key)).toEqual(['ride-best', 'run-best'])
    expect(out?.items.length).toBeLessThanOrEqual(4)
    expect(JSON.stringify(out)).not.toMatch(/lean|toward (running|cycling)/i)
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
    const out = balanceChanges(input(previous, { result: easy }))
    expect(keys(out)).toEqual(['ride-best', 'run-best'])
    expect(out?.items.map((item) => Object.keys(item).sort())).toEqual([
      ['body', 'direction', 'key', 'title'],
      ['body', 'direction', 'key', 'title'],
    ])
  })

  it('lists a best the call read every effort for as plainly as any other: its direction, its words, no label', () => {
    const { input, scaled, result } = measured()
    const easy = { ...result, effort: [check(0.6, 0.6)] }
    // One period hard and the other easy: too few hard efforts in both, so the call reads every effort.
    const mixed = { ...scaled(0.95, 0.9), headlineEffort: check(0.95, 0.95) }
    const change = changeOf('higher')
    change.run = change.run.map((call) => Object.assign({}, call, { gated: false }))
    const out = balanceChanges(input(mixed, { result: easy, change }))
    expect(keys(out)).toEqual(['ride-best', 'run-best'])
    const run = out?.items.find((item) => item.key === 'run-best')
    expect(run).toMatchObject({ direction: 'up' })
    expect(run?.title).toMatch(/^Faster 20 min run/)
    // The same fields as the best whose call was gated.
    expect(Object.keys(run ?? {}).sort()).toEqual(['body', 'direction', 'key', 'title'])
  })

  it('gives only its items: no line about a best that was not hard, or an effort that was not checked', () => {
    const { input, scaled, result } = measured()
    const easy = { ...result, effort: [check(0.6, 0.6)] }
    const change = changeOf('higher')
    // The call read every effort in both periods, because too few were shown hard.
    change.run = change.run.map((call) => Object.assign({}, call, { gated: false }))
    const out = balanceChanges(
      input({ ...scaled(0.95, 0.9), headlineEffort: check(0.6, 0.6) }, { result: easy, change }),
    )
    expect(Object.keys(out ?? {})).toEqual(['items'])
    expect(JSON.stringify(out)).not.toMatch(/hard effort|comparable|not checked|every effort/i)
  })

  it('is absent, with no text, when neither sport could be tested', () => {
    const { input, scaled } = measured()
    expect(balanceChanges(input(scaled(0.9, 0.9), { change: changeOf('untested') }))).toBeNull()
  })
})

describe('balanceChanges: direction and the strip’s band', () => {
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
