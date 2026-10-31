import { describe, expect, it } from 'vitest'
import { RACE_LOG_SD, RACE_RANGE_Z, RUN_RACE_DISTANCES_M } from '../constants'
import { danielsTime } from './daniels'
import { riegelTime } from './riegel'
import { predictRunRaces } from './races'

const bests = [
  { distanceM: 5000, seconds: 21 * 60 },
  { distanceM: 10000, seconds: 44 * 60 },
]
const weeklyM = 40_000

describe('predictRunRaces', () => {
  it('sets each race at the geometric middle of the runs and the heart rate', () => {
    const { races } = predictRunRaces({
      bests,
      vo2max: { vo2max: 55, runs: 4, hillCapped: 0 },
      weeklyM,
    })
    const fiveK = races[0]!
    const fromHeart = riegelTime(
      [5000, 10000].map((distanceM) => ({ distanceM, seconds: danielsTime(distanceM, 55) })),
      5000,
    )!.seconds
    expect(fiveK.methods.map((m) => m.method)).toEqual(['performances', 'heartRate'])
    expect(fiveK.methods[1]!.seconds).toBeCloseTo(fromHeart, 6)
    expect(fiveK.seconds).toBeCloseTo(Math.sqrt(fiveK.methods[0]!.seconds * fromHeart), 6)
  })

  it('widens the range with the published error and the methods’ disagreement', () => {
    const one = predictRunRaces({ bests, vo2max: null, weeklyM }).races[0]!
    expect(Math.log(one.high / one.seconds)).toBeCloseTo(RACE_RANGE_Z * RACE_LOG_SD[5000], 6)
    const two = predictRunRaces({ bests, vo2max: { vo2max: 60, runs: 4, hillCapped: 0 }, weeklyM })
      .races[0]!
    expect(Math.log(two.high / two.seconds)).toBeGreaterThan(RACE_RANGE_Z * RACE_LOG_SD[5000])
  })

  it('reads the fitness the bests show, and predicts every race from heart rate alone', () => {
    const fromHeart = predictRunRaces({
      bests: [],
      vo2max: { vo2max: 50, runs: 3, hillCapped: 0 },
      weeklyM,
    })
    expect(fromHeart.races.map((p) => p.distanceM)).toEqual([...RUN_RACE_DISTANCES_M])
    expect(fromHeart.runsVdot).toBeNull()
    expect(predictRunRaces({ bests, vo2max: null, weeklyM }).runsVdot).toBeGreaterThan(40)
  })

  it('predicts nothing without bests or heart rate', () => {
    expect(predictRunRaces({ bests: [], vo2max: null, weeklyM }).races).toEqual([])
  })

  it('does not predict beyond a time already run at the distance, and moves the range with it', () => {
    // A 5 km faster than the 10 km implies: the carried middle would be slower than the run itself.
    const quick = [
      { distanceM: 5000, seconds: 19 * 60 },
      { distanceM: 10000, seconds: 41 * 60 },
    ]
    const five = predictRunRaces({ bests: quick, vo2max: null, weeklyM }).races[0]!
    expect(five.seconds).toBe(19 * 60)
    expect(five.floored).toBe(true)
    const free = predictRunRaces({ bests: [quick[1]!], vo2max: null, weeklyM }).races[0]!
    expect(free.seconds).toBeGreaterThan(19 * 60)
    expect(free.floored).toBe(false)
    expect(five.high / five.seconds).toBeGreaterThan(1)
    expect(Math.log(five.high / five.seconds)).toBeCloseTo(RACE_RANGE_Z * RACE_LOG_SD[5000], 6)
    // The unmoved 10 km is not touched by it.
    const ten = predictRunRaces({ bests: quick, vo2max: null, weeklyM }).races[1]!
    expect(ten.seconds).toBeLessThanOrEqual(41 * 60)
  })

  it('leaves a race with no best near it to the heart rate, and a short best does not set a long race', () => {
    const mileOnly = [{ distanceM: 1609.344, seconds: 330 }]
    const races = predictRunRaces({ bests: mileOnly, vo2max: null, weeklyM }).races
    expect(races.map((r) => r.distanceM)).toEqual([5000])
    const withHeart = predictRunRaces({
      bests: mileOnly,
      vo2max: { vo2max: 50, runs: 3, hillCapped: 0 },
      weeklyM,
    }).races
    for (const race of withHeart.filter((r) => r.distanceM > 5000)) {
      expect(race.methods.map((m) => m.method)).toEqual(['heartRate'])
    }
  })
})
