import { describe, expect, it } from 'vitest'
import { HR_SET_ASIDE_MIN_S } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { judgeHeartRate } from './setAside'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const before = combine(digests, settings)

/**
 * A copy of a power-meter ride whose sensor read 60 bpm throughout, with a best 10 min a tenth above
 * the library's best, so it is held above threshold, and a spike that would raise the reference. It
 * carries no calibration, so the bike model, and so every other figure, stays as it was.
 */
function brokenSensorRide(): ActivityDigest {
  const source = digests.find((d) => d.sport === 'ride' && d.powerSource === 'measured')!
  const best10 = before.rideCurve.find((p) => p.durationS === HR_SET_ASIDE_MIN_S)!.value
  return {
    ...source,
    id: 'broken-sensor',
    startMs: source.startMs + 1,
    maxHeartRate: 250,
    calibration: null,
    climbSections: [],
    hrBlocks: source.hrBlocks.map(({ value, terms }) => ({ heartRate: 60, value, terms })),
    curve: source.curve.map(({ durationS, value, startIndex, windowS, terms }) => ({
      durationS,
      value: durationS === HR_SET_ASIDE_MIN_S ? best10 * 1.1 : value,
      startIndex: Math.max(0, startIndex),
      windowS,
      heartRate: 60,
      terms,
    })),
  }
}

describe('heart rate that cannot be right', () => {
  const after = combine([...digests, brokenSensorRide()], settings)

  it('sets nothing aside in a library whose heart rate fits its efforts', () => {
    expect(before.heartRateSetAside).toEqual([])
  })

  it('sets aside a ride that held 10 min above threshold at 60 bpm', () => {
    expect(after.heartRateSetAside).toEqual(['broken-sensor'])
  })

  it('leaves its blocks out of the heart-rate check and its spike out of the references', () => {
    expect(after.hr.ride?.points.some((p) => p.activityId === 'broken-sensor')).toBe(false)
    expect(after.hr.run).toEqual(before.hr.run)
    expect(after.rideMaxHeartRate).toBe(before.rideMaxHeartRate)
    expect(after.maxHeartRate).toBe(before.maxHeartRate)
  })

  it('still counts its watts, but no longer judges that best effort by its heart rate', () => {
    expect(after.rideCurve.find((p) => p.durationS === HR_SET_ASIDE_MIN_S)!.activityId).toBe(
      'broken-sensor',
    )
    const check = after.effort.find((e) => e.durationS === HR_SET_ASIDE_MIN_S)
    if (check) expect(check.rideHrFraction).toBeNull()
  })

  it('is the same judgement judgeHeartRate makes without the rest of the analysis', () => {
    const library = [...digests, brokenSensorRide()]
    expect(judgeHeartRate(library, settings).setAside).toEqual(after.heartRateSetAside)
    expect(judgeHeartRate(digests, settings).setAside).toEqual([])
  })

  it('takes a set-aside judged elsewhere as it is, for the activities it names', () => {
    const library = [...digests, brokenSensorRide()]
    const taken = combine(library, settings, { heartRateSetAside: new Set(['broken-sensor']) })
    expect(taken.heartRateSetAside).toEqual(['broken-sensor'])
    expect(taken.rideMaxHeartRate).toBe(before.rideMaxHeartRate)
    // A set naming no activity here sets none aside, whatever these digests would have said alone.
    const none = combine(library, settings, { heartRateSetAside: new Set(['elsewhere']) })
    expect(none.heartRateSetAside).toEqual([])
    // A period's analysis names only its own activities.
    const period = combine(digests, settings, { heartRateSetAside: new Set(['broken-sensor']) })
    expect(period.heartRateSetAside).toEqual([])
  })
})
