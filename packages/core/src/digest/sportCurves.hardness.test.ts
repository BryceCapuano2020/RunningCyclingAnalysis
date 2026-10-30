import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from '../constants'
import { PeriodCache } from '../periodCache'
import type { EffortReference } from '../effort'
import { ride, SETTINGS } from './test/estimatedRideFixture'
import { sportCurves } from './rideCurves'

const model = { ...DEFAULT_BIKE_MODEL }
const REFERENCE = { run: 190, ride: 180 }
/** The effort reference of a library whose maxima the activities give, trusted. */
const effortOf = (referenceHr: { run: number | null; ride: number | null }): EffortReference => ({
  referenceHr,
  reading: { run: 'trusted', ride: 'trusted' },
  source: { run: 'data', ride: 'data' },
  from: { run: 'run', ride: 'ride' },
})
/** A power-meter ride whose best 20 minutes were held at a heart rate. */
const hold = (id: string, heartRate: number | null) =>
  ride(id, 0, 'measured', { 1200: { watts: 250, heartRate } })

describe('sportCurves hardness', () => {
  it('says nothing about effort unless asked, so the curves are what they were', () => {
    expect(sportCurves([hold('a', 170)], SETTINGS, model).headlineEffort).toBeUndefined()
  })

  it('reads the best 20 minutes’ heart rate against the library’s reference, as a period’s own check does', () => {
    const asked = (heartRate: number | null, setAside: string[] = []) =>
      sportCurves([hold('a', heartRate)], SETTINGS, model, undefined, {
        effort: effortOf(REFERENCE),
        setAside: new Set(setAside),
      }).headlineEffort
    expect(asked(171)?.rideHrFraction).toBeCloseTo(171 / 180)
    expect(asked(171)?.runHrFraction).toBeNull()
    expect(asked(null)?.rideHrFraction).toBeNull()
    // A heart rate set aside is not read, as in the period's own check.
    expect(asked(171, ['a'])?.rideHrFraction).toBeNull()
  })

  it('leaves the curve values untouched by asking', () => {
    const plain = sportCurves([hold('a', 171)], SETTINGS, model)
    const asked = sportCurves([hold('a', 171)], SETTINGS, model, undefined, {
      effort: effortOf(REFERENCE),
      setAside: new Set(),
    })
    expect(asked.rideCurve).toEqual(plain.rideCurve)
    expect(asked.runCurve).toEqual(plain.runCurve)
  })
})

describe('PeriodCache previous curves and the effort check', () => {
  it('redoes the curves when the reference heart rate changes, and keeps them while it holds', () => {
    const cache = new PeriodCache()
    const previous = [hold('a', 171)]
    const get = (referenceHr: { run: number | null; ride: number | null }) =>
      cache.previousCurves([], previous, SETTINGS, model, undefined, {
        effortReference: effortOf(referenceHr),
        setAside: [],
      })
    const first = get(REFERENCE)
    expect(get({ ...REFERENCE })).toBe(first)
    const other = get({ run: 190, ride: 200 })
    expect(other).not.toBe(first)
    expect(other.headlineEffort?.rideHrFraction).toBeCloseTo(171 / 200)
  })

  it('judges the effort with the highest heart rate among the 20 minute bests within 5% of the best, as the gate does', () => {
    const asked = (library: ReturnType<typeof hold>[]) =>
      sportCurves(library, SETTINGS, model, undefined, {
        effort: effortOf(REFERENCE),
        setAside: new Set(),
      }).headlineEffort
    // Two rides within 5% of each other in watts: the check reads the one held at the higher heart rate.
    const near = ride('b', 1, 'measured', { 1200: { watts: 245, heartRate: 176 } })
    expect(asked([hold('a', 150), near])?.rideHrFraction).toBeCloseTo(176 / 180)
    const far = ride('c', 1, 'measured', { 1200: { watts: 200, heartRate: 179 } })
    expect(asked([hold('a', 150), far])?.rideHrFraction).toBeCloseTo(150 / 180)
  })
})
