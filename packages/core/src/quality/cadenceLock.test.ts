import { describe, expect, it } from 'vitest'
import { cadenceLockStretches } from './cadenceLock'
import { honestSeries, plantLock, RIDE_SERIES, RUN_SERIES } from './test/cadenceLockSeries'

const MOVING = (n: number) => new Uint8Array(n).fill(1)
const run = (seed: number, n = 900) =>
  honestSeries({ n, hr: 168, cadence: 172, ...RUN_SERIES }, seed)

describe('the cadence-lock detector', () => {
  it('emits only even run cadences, so the sim cannot flatter it with continuous values', () => {
    const { cadence } = run(1, 3000)
    expect(cadence.every((c) => c % 2 === 0)).toBe(true)
  })

  it('finds a planted lock of 45 s and no more than that', () => {
    const series = honestSeries({ n: 900, hr: 150, cadence: 172, ...RUN_SERIES }, 2)
    plantLock(series, 300, 45, 20)
    const found = cadenceLockStretches(series.heartRate, series.cadence, MOVING(900))
    expect(found).toHaveLength(1)
    expect(found[0]!.start).toBeGreaterThanOrEqual(295)
    expect(found[0]!.start).toBeLessThanOrEqual(300)
    expect(found[0]!.end).toBeGreaterThanOrEqual(345)
    expect(found[0]!.end).toBeLessThanOrEqual(350)
  })

  it('finds a lock on a ride, in rpm', () => {
    const series = honestSeries({ n: 900, hr: 140, cadence: 85, ...RIDE_SERIES }, 3)
    plantLock(series, 200, 90, 21)
    expect(cadenceLockStretches(series.heartRate, series.cadence, MOVING(900))).toHaveLength(1)
  })

  it('finds a lock whose reading is a beat off the cadence now and then', () => {
    const series = run(4)
    plantLock(series, 400, 90, 22, 1)
    expect(cadenceLockStretches(series.heartRate, series.cadence, MOVING(900))).toHaveLength(1)
  })

  it('does not flag a lock of 20 s', () => {
    const series = run(5)
    plantLock(series, 300, 20, 23)
    expect(cadenceLockStretches(series.heartRate, series.cadence, MOVING(900))).toEqual([])
  })

  it('ignores a lock while stopped', () => {
    const series = run(6)
    plantLock(series, 300, 90, 24)
    const moving = MOVING(900)
    moving.fill(0, 290, 400)
    expect(cadenceLockStretches(series.heartRate, series.cadence, moving)).toEqual([])
  })

  it('does not flag a flat heart rate that equals a flat cadence', () => {
    const heartRate = new Float64Array(600).fill(170)
    const cadence = new Float32Array(600).fill(170)
    expect(cadenceLockStretches(heartRate, cadence, MOVING(600))).toEqual([])
  })

  it('does not flag a cadence under 60, where a heart rate cannot be the stride', () => {
    const series = honestSeries({ n: 600, hr: 50, cadence: 50, even: false, jitter: 2 }, 7)
    plantLock(series, 100, 200, 25)
    expect(cadenceLockStretches(series.heartRate, series.cadence, MOVING(600))).toEqual([])
  })

  it('bridges a hole of two seconds but not three', () => {
    const bridged = run(8)
    plantLock(bridged, 300, 120, 26)
    bridged.heartRate[350] = 120
    bridged.heartRate[351] = 120
    expect(cadenceLockStretches(bridged.heartRate, bridged.cadence, MOVING(900))).toHaveLength(1)
    const split = run(8)
    plantLock(split, 300, 120, 26)
    split.heartRate.fill(120, 350, 353)
    expect(cadenceLockStretches(split.heartRate, split.cadence, MOVING(900))).toHaveLength(2)
  })

  it('does not flag two noisy series that merely agree in level', () => {
    for (let seed = 30; seed < 60; seed++) {
      const { heartRate, cadence } = run(seed, 1200)
      expect(cadenceLockStretches(heartRate, cadence, MOVING(1200))).toEqual([])
    }
  })

  it('skips missing samples without throwing', () => {
    const series = run(9)
    plantLock(series, 300, 90, 27)
    series.heartRate.fill(NaN, 100, 120)
    series.cadence.fill(NaN, 500, 520)
    expect(cadenceLockStretches(series.heartRate, series.cadence, MOVING(900))).toHaveLength(1)
  })
})
