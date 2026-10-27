import { describe, expect, it } from 'vitest'
import { RACE_LOG_SD, RACE_RANGE_Z, RUN_RACE_DISTANCES_M } from '../constants'
import { danielsTime } from './daniels'
import { carried } from './riegel'
import { predictRunRaces } from './races'

const bests = [
  { distanceM: 5000, seconds: 21 * 60 },
  { distanceM: 10000, seconds: 44 * 60 },
]
const weeklyM = 40_000

describe('predictRunRaces', () => {
  it('sets each race at the geometric middle of the runs and the heart rate', () => {
    const { races } = predictRunRaces({ bests, vo2max: { vo2max: 55, runs: 4 }, weeklyM })
    const fiveK = races[0]!
    const fromHeart = Math.min(
      danielsTime(5000, 55),
      carried({ distanceM: 10000, seconds: danielsTime(10000, 55) }, 5000),
    )
    expect(fiveK.methods.map((m) => m.method)).toEqual(['performances', 'heartRate'])
    expect(fiveK.methods[1]!.seconds).toBeCloseTo(fromHeart, 6)
    expect(fiveK.seconds).toBeCloseTo(Math.sqrt(fiveK.methods[0]!.seconds * fromHeart), 6)
  })

  it('widens the range with the published error and the methods’ disagreement', () => {
    const one = predictRunRaces({ bests, vo2max: null, weeklyM }).races[0]!
    expect(Math.log(one.high / one.seconds)).toBeCloseTo(RACE_RANGE_Z * RACE_LOG_SD[5000], 6)
    const two = predictRunRaces({ bests, vo2max: { vo2max: 60, runs: 4 }, weeklyM }).races[0]!
    expect(Math.log(two.high / two.seconds)).toBeGreaterThan(RACE_RANGE_Z * RACE_LOG_SD[5000])
  })

  it('reads the fitness the bests show, and predicts every race from heart rate alone', () => {
    const fromHeart = predictRunRaces({ bests: [], vo2max: { vo2max: 50, runs: 3 }, weeklyM })
    expect(fromHeart.races.map((p) => p.distanceM)).toEqual([...RUN_RACE_DISTANCES_M])
    expect(fromHeart.runsVdot).toBeNull()
    expect(predictRunRaces({ bests, vo2max: null, weeklyM }).runsVdot).toBeGreaterThan(40)
  })

  it('predicts nothing without bests or heart rate', () => {
    expect(predictRunRaces({ bests: [], vo2max: null, weeklyM }).races).toEqual([])
  })
})
