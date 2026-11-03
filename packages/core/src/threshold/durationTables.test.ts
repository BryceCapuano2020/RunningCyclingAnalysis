import { describe, expect, it } from 'vitest'
import { SPORTS } from '../types'
import { durationRatio, ratioSpread } from './durationRatio'
import { DURATION_TABLES, runDurationRatio } from './durationTables'

describe('the running duration table', () => {
  it('is Daniels and Gilbert’s share of VO2max over the share held for an hour', () => {
    const ratios = [5, 10, 20, 40, 60].map((minutes) => runDurationRatio(minutes * 60))
    expect(ratios.map((r) => Number(r.toFixed(3)))).toEqual([1.229, 1.137, 1.073, 1.029, 1])
  })

  it('is 1 at 60 min, falls steadily from 3 min to there, and keeps falling past it', () => {
    expect(runDurationRatio(3600)).toBeCloseTo(1, 12)
    const minutes = [3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 180]
    for (let i = 1; i < minutes.length; i++) {
      expect(runDurationRatio(minutes[i]! * 60)).toBeLessThan(
        runDurationRatio(minutes[i - 1]! * 60),
      )
    }
    expect(runDurationRatio(5400)).toBeLessThan(1)
  })
})

describe('the tables by sport', () => {
  it('has one for every sport, and a rider’s is the ratio and spread the ride estimate always used', () => {
    expect(Object.keys(DURATION_TABLES).sort()).toEqual([...SPORTS].sort())
    for (const durationS of [180, 480, 1200, 2700, 3600, 5400]) {
      expect(DURATION_TABLES.ride.ratio(durationS)).toBe(durationRatio(durationS))
      expect(DURATION_TABLES.ride.spread(durationS)).toBe(ratioSpread(durationS))
    }
  })

  it('has a ratio of 1 at an hour in every sport: a threshold is what is held for an hour', () => {
    for (const sport of SPORTS) expect(DURATION_TABLES[sport].ratio(3600)).toBeCloseTo(1, 12)
  })

  it('starts a runner’s spread from the rider’s, smallest at 20 min', () => {
    expect(DURATION_TABLES.run.spread(1200)).toBeCloseTo(0.025, 12)
    expect(DURATION_TABLES.run.spread(480)).toBeGreaterThan(DURATION_TABLES.run.spread(1200))
  })
})
