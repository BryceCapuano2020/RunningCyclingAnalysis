import { describe, expect, it } from 'vitest'
import type { MeasureTime } from './periodTime'
import {
  biggestShift,
  effortSplit,
  hasEnoughZoneTime,
  mainZone,
  MIN_ZONE_ACTIVITIES,
  MIN_ZONE_SECONDS,
  zoneShares,
} from './zoneShares'

function time(seconds: number[], extra: Partial<MeasureTime> = {}): MeasureTime {
  return {
    sport: 'run',
    measure: 'heartRate',
    names: seconds.map((_, i) => `Zone ${i + 1}`),
    seconds,
    totalSeconds: seconds.reduce((a, b) => a + b, 0),
    counted: 5,
    noData: 0,
    noZones: 0,
    entered: 0,
    ...extra,
  }
}

describe('zone shares', () => {
  it('shares the time by zone, and none without time', () => {
    expect(zoneShares(time([50, 50, 0, 0, 0]))).toEqual([0.5, 0.5, 0, 0, 0])
    expect(zoneShares(time([0, 0, 0, 0, 0]))).toEqual([0, 0, 0, 0, 0])
  })

  it('splits easy, middle and hard at the zones the table names', () => {
    const split = effortSplit(time([10, 50, 20, 15, 5]))
    expect(split.easy).toBeCloseTo(0.6, 12)
    expect(split.middle).toBeCloseTo(0.2, 12)
    expect(split.hard).toBeCloseTo(0.2, 12)
  })

  it('names the main zone, the lower one on a tie, and none without time', () => {
    expect(mainZone(time([10, 40, 40, 10, 0]))).toEqual({ level: 2, share: 0.4 })
    expect(mainZone(time([0, 0, 0, 0, 0]))).toBeNull()
  })

  it('finds the zone whose share moved most between two periods', () => {
    const before = time([10, 30, 40, 20, 0])
    const after = time([10, 60, 20, 10, 0])
    const shift = biggestShift(before, after)
    expect(shift?.level).toBe(2)
    expect(shift?.before).toBeCloseTo(0.3, 12)
    expect(shift?.after).toBeCloseTo(0.6, 12)
    expect(biggestShift(time([0, 0, 0, 0, 0]), after)).toBeNull()
  })

  it('needs activities and time before a measure is described', () => {
    const enough = time([MIN_ZONE_SECONDS, 0, 0, 0, 0], { counted: MIN_ZONE_ACTIVITIES })
    expect(hasEnoughZoneTime(enough)).toBe(true)
    expect(hasEnoughZoneTime({ ...enough, counted: MIN_ZONE_ACTIVITIES - 1 })).toBe(false)
    expect(hasEnoughZoneTime({ ...enough, totalSeconds: MIN_ZONE_SECONDS - 1 })).toBe(false)
  })
})
