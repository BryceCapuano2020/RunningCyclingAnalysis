import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from '../constants'
import { PeriodCache } from '../periodCache'
import { ride, SETTINGS } from './test/estimatedRideFixture'
import { sportCurves } from './rideCurves'

const model = { ...DEFAULT_BIKE_MODEL }
const REFERENCE = { run: 190, ride: 180 }
const READING = { run: 'trusted', ride: 'trusted' } as const
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
        reference: REFERENCE,
        reading: READING,
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
      reference: REFERENCE,
      reading: READING,
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
        referenceHr,
        referenceReading: READING,
        setAside: [],
      })
    const first = get(REFERENCE)
    expect(get({ ...REFERENCE })).toBe(first)
    const other = get({ run: 190, ride: 200 })
    expect(other).not.toBe(first)
    expect(other.headlineEffort?.rideHrFraction).toBeCloseTo(171 / 200)
  })
})
