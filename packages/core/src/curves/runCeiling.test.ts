import { describe, expect, it } from 'vitest'
import { RUN_WORLD_RECORD_SPEEDS } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic'
import { possibleRunWkg, runCeilingSpeed } from './runCeiling'

describe('the run ceiling table', () => {
  it('holds the open men’s world-record speed at each duration the spec names', () => {
    expect(RUN_WORLD_RECORD_SPEEDS).toEqual([
      { durationS: 5, speedMs: 12.2 },
      { durationS: 10, speedMs: 12.2 },
      { durationS: 20, speedMs: 10.44 },
      { durationS: 43, speedMs: 9.3 },
      { durationS: 101, speedMs: 7.93 },
      { durationS: 206, speedMs: 7.28 },
      { durationS: 755, speedMs: 6.62 },
      { durationS: 1571, speedMs: 6.37 },
      { durationS: 3450, speedMs: 6.12 },
      { durationS: 7235, speedMs: 5.83 },
    ])
  })
})

describe('runCeilingSpeed', () => {
  it('reads the table exactly at its own durations', () => {
    for (const { durationS, speedMs } of RUN_WORLD_RECORD_SPEEDS) {
      expect(runCeilingSpeed(durationS)).toBe(speedMs)
    }
  })

  it('interpolates in log duration and log speed, so the log midpoint gives the geometric mean', () => {
    // 20 s and 43 s; their geometric mean duration is the log midpoint of the two.
    expect(runCeilingSpeed(Math.sqrt(20 * 43))).toBeCloseTo(Math.sqrt(10.44 * 9.3), 12)
  })

  it('holds the end values beyond the ends of the table', () => {
    expect(runCeilingSpeed(1)).toBe(12.2)
    expect(runCeilingSpeed(86_400)).toBe(5.83)
  })

  it('never rises with duration', () => {
    let previous = Infinity
    for (let durationS = 5; durationS <= 8000; durationS += 7) {
      const speed = runCeilingSpeed(durationS)
      expect(speed).toBeLessThanOrEqual(previous)
      previous = speed
    }
  })
})

describe('possibleRunWkg', () => {
  it('keeps a point whose flat speed is under the ceiling for its duration', () => {
    const wkg = flatSpeedToMetabolic(8)
    expect(possibleRunWkg(60, wkg)).toBe(wkg)
  })

  it('drops the 1 minute point at 2:17/mi, 11.7 m/s, which no runner can hold', () => {
    expect(possibleRunWkg(60, flatSpeedToMetabolic(11.7))).toBeNaN()
  })

  it('keeps a missing point missing', () => {
    expect(possibleRunWkg(60, Number.NaN)).toBeNaN()
  })
})
