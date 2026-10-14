import { describe, expect, it } from 'vitest'
import { resample } from './resample'
describe('resample', () => {
  it('returns an empty grid for no records', () => {
    const r = resample([])
    expect(r.n).toBe(0)
    expect(r.startMs).toBe(0)
    expect(r.speed.length).toBe(0)
    expect(r.distance.length).toBe(0)
    expect(r.altitude.length).toBe(0)
    expect(r.heartRate.length).toBe(0)
    expect(r.power.length).toBe(0)
    expect(r.hasPower).toBe(false)
    expect(r.hasHeartRate).toBe(false)
    expect(r.hasAltitude).toBe(false)
  })

  it('ignores records whose timestamp is not finite', () => {
    const r = resample([
      { tMs: NaN, speed: 9 },
      { tMs: 5000, speed: 2 },
    ])
    expect(r.startMs).toBe(5000)
    expect(r.n).toBe(1)
    expect(Array.from(r.speed)).toEqual([2])
  })

  it('sorts by time and lets the later record win when two land on one index', () => {
    const r = resample([
      { tMs: 1000, speed: 5 },
      { tMs: 400, speed: 3 },
      { tMs: 0, speed: 1 },
      { tMs: 1600, speed: 7 },
    ])
    // 0 and 400 ms round to index 0 (later, 3, wins); 1000 ms is index 1; 1600 ms is index 2.
    expect(r.startMs).toBe(0)
    expect(r.n).toBe(3)
    expect(Array.from(r.speed)).toEqual([3, 5, 7])
    // Speed only, so distance is the running integral: 3, 3+5, 3+5+7.
    expect(Array.from(r.distance)).toEqual([3, 8, 15])
  })

  it('interpolates a gap of exactly 10 s', () => {
    const r = resample([
      { tMs: 0, speed: 0, distance: 0, altitude: 100, heartRate: 100, power: 100 },
      { tMs: 10000, speed: 10, distance: 50, altitude: 200, heartRate: 200, power: 300 },
    ])
    expect(r.n).toBe(11)
    expect(Array.from(r.speed)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(Array.from(r.distance)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
    expect(Array.from(r.altitude)).toEqual([100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200])
    expect(Array.from(r.heartRate)).toEqual([100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200])
    expect(Array.from(r.power)).toEqual([100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300])
    expect(r.hasPower).toBe(true)
    expect(r.hasHeartRate).toBe(true)
    expect(r.hasAltitude).toBe(true)
  })

  it('treats a gap longer than 10 s as a pause', () => {
    const r = resample([
      { tMs: 0, speed: 4, distance: 10, altitude: 100, heartRate: 120, power: 200 },
      { tMs: 11000, speed: 6, distance: 40, altitude: 110, heartRate: 130, power: 240 },
    ])
    expect(r.n).toBe(12)
    // Speed and power drop to zero, heart rate is unknown, distance holds, altitude interpolates.
    expect(Array.from(r.speed)).toEqual([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6])
    expect(Array.from(r.power)).toEqual([200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240])
    expect(Array.from(r.heartRate)).toEqual([
      120,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      NaN,
      130,
    ])
    expect(Array.from(r.distance)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 40])
    const altitude = Array.from(r.altitude)
    for (let i = 0; i < 12; i++) {
      expect(altitude[i]).toBeCloseTo(100 + (10 * i) / 11, 10)
    }
  })

  it('uses the nearest known value before the first and after the last sample', () => {
    const r = resample([
      { tMs: 2000, speed: 4, distance: 8, heartRate: 140, power: 250, altitude: 70 },
      { tMs: 0 },
      { tMs: 4000 },
    ])
    expect(r.n).toBe(5)
    expect(Array.from(r.speed)).toEqual([0, 0, 4, 0, 0])
    expect(Array.from(r.distance)).toEqual([8, 8, 8, 8, 8])
    expect(Array.from(r.altitude)).toEqual([70, 70, 70, 70, 70])
    expect(Array.from(r.heartRate)).toEqual([NaN, NaN, 140, NaN, NaN])
    expect(Array.from(r.power)).toEqual([0, 0, 250, 0, 0])
  })

  it('integrates speed into distance when no record has distance', () => {
    const r = resample([
      { tMs: 0, speed: 2 },
      { tMs: 2000, speed: 4 },
    ])
    expect(Array.from(r.speed)).toEqual([2, 3, 4])
    expect(Array.from(r.distance)).toEqual([2, 5, 9])
  })

  it('derives speed from distance when no record has speed', () => {
    const r = resample([
      { tMs: 0, distance: 0 },
      { tMs: 2000, distance: 10 },
      { tMs: 3000, distance: 10 },
    ])
    expect(Array.from(r.distance)).toEqual([0, 5, 10, 10])
    expect(Array.from(r.speed)).toEqual([0, 5, 5, 0])
  })

  it('returns zero speed and distance when neither is recorded', () => {
    const r = resample([
      { tMs: 0, heartRate: 100 },
      { tMs: 1000, heartRate: 110 },
    ])
    expect(r.n).toBe(2)
    expect(Array.from(r.speed)).toEqual([0, 0])
    expect(Array.from(r.distance)).toEqual([0, 0])
    expect(Array.from(r.heartRate)).toEqual([100, 110])
    expect(r.hasPower).toBe(false)
    expect(r.hasAltitude).toBe(false)
  })

  it('makes distance non-decreasing and derives speed from the result', () => {
    const r = resample([
      { tMs: 0, distance: 10 },
      { tMs: 1000, distance: 5 },
      { tMs: 2000, distance: 20 },
    ])
    expect(Array.from(r.distance)).toEqual([10, 10, 20])
    expect(Array.from(r.speed)).toEqual([0, 0, 10])
  })

  it('makes power, heart rate and altitude NaN when their flag is false', () => {
    const r = resample([
      { tMs: 0, speed: 1, heartRate: 0, power: 0 },
      { tMs: 1000, speed: 2, heartRate: 0, power: 0 },
    ])
    expect(r.hasPower).toBe(false)
    expect(r.hasHeartRate).toBe(false)
    expect(r.hasAltitude).toBe(false)
    expect(Array.from(r.power)).toEqual([NaN, NaN])
    expect(Array.from(r.heartRate)).toEqual([NaN, NaN])
    expect(Array.from(r.altitude)).toEqual([NaN, NaN])
    expect(Array.from(r.speed)).toEqual([1, 2])
    expect(Array.from(r.distance)).toEqual([1, 3])
  })

  it('keeps power and heart rate NaN for a single record that lacks them', () => {
    const r = resample([{ tMs: 0, speed: 1 }])
    expect(r.n).toBe(1)
    expect(Array.from(r.power)).toEqual([NaN])
    expect(Array.from(r.heartRate)).toEqual([NaN])
  })

  it('leaves power NaN for a 20 s stretch with no power while the device kept recording', () => {
    const records = Array.from({ length: 50 }, (_, t) => ({
      tMs: t * 1000,
      speed: 6,
      power: t >= 10 && t <= 29 ? undefined : 200,
    }))
    const r = resample(records)
    expect(r.n).toBe(50)
    expect(r.paused.every((v) => v === 0)).toBe(true)
    expect(Array.from(r.power.slice(8, 32))).toEqual([
      200,
      200,
      ...Array.from({ length: 20 }, () => NaN),
      200,
      200,
    ])
    expect(r.power[49]).toBe(200)
    expect(Array.from(r.speed.slice(10, 30)).every((v) => v === 6)).toBe(true)
  })

  it('marks an auto-pause with no records as paused and holds speed at zero', () => {
    const records = [
      ...Array.from({ length: 120 }, (_, t) => ({ tMs: t * 1000, speed: 5 })),
      ...Array.from({ length: 120 }, (_, k) => ({ tMs: (180 + k) * 1000, speed: 5 })),
    ]
    const r = resample(records)
    expect(r.n).toBe(300)
    const expectedPaused = [
      ...Array.from({ length: 120 }, () => 0),
      ...Array.from({ length: 60 }, () => 1),
      ...Array.from({ length: 120 }, () => 0),
    ]
    expect(Array.from(r.paused)).toEqual(expectedPaused)
    expect(Array.from(r.speed.slice(118, 183))).toEqual([
      5,
      5,
      ...Array.from({ length: 60 }, () => 0),
      5,
      5,
      5,
    ])
    // Distance is integrated from speed, so it stays flat through the pause.
    expect(r.distance[119]).toBe(600)
    expect(r.distance[179]).toBe(600)
    expect(r.distance[299]).toBe(1200)
  })

  it('leaves speed and power NaN where records exist but the sensor drops out', () => {
    const records = Array.from({ length: 30 }, (_, t) => {
      const inDropout = t >= 10 && t <= 19
      return {
        tMs: t * 1000,
        altitude: 100 + t,
        heartRate: 140,
        speed: inDropout ? undefined : 6,
        power: inDropout ? undefined : 200,
      }
    })
    const r = resample(records)
    expect(r.n).toBe(30)
    expect(r.paused.every((v) => v === 0)).toBe(true)
    expect(Array.from(r.speed.slice(8, 22))).toEqual([
      6,
      6,
      ...Array.from({ length: 10 }, () => NaN),
      6,
      6,
    ])
    expect(Array.from(r.power.slice(8, 22))).toEqual([
      200,
      200,
      ...Array.from({ length: 10 }, () => NaN),
      200,
      200,
    ])
    expect(Array.from(r.heartRate.slice(0, 3))).toEqual([140, 140, 140])
    expect(r.altitude[15]).toBe(115)
    // Integrated distance ignores the unknown speed, so it is flat across the dropout.
    expect(r.distance[9]).toBe(60)
    expect(r.distance[19]).toBe(60)
    expect(r.distance[29]).toBe(120)
  })

  it('holds distance flat across a speed dropout when there is no distance record', () => {
    const records = [
      { tMs: 0, speed: 2 },
      ...Array.from({ length: 11 }, (_, k) => ({ tMs: (k + 1) * 1000, altitude: 100 })),
      { tMs: 12000, speed: 2 },
    ]
    const r = resample(records)
    expect(r.n).toBe(13)
    expect(Array.from(r.speed.slice(1, 12))).toEqual(Array.from({ length: 11 }, () => NaN))
    expect(r.distance[0]).toBe(2)
    expect(r.distance[11]).toBe(2)
    expect(r.distance[12]).toBe(4)
  })

  it('drops timestamps more than a day from the median', () => {
    const base = Date.UTC(2024, 0, 1)
    const records = [
      { tMs: Date.UTC(1989, 11, 31, 12), speed: 99 },
      ...Array.from({ length: 5 }, (_, k) => ({ tMs: base + k * 1000, speed: 1 })),
    ]
    const r = resample(records)
    expect(r.startMs).toBe(base)
    expect(r.n).toBe(5)
    expect(Array.from(r.speed)).toEqual([1, 1, 1, 1, 1])
  })

  it('reports zero speed for a stationary distance record', () => {
    const r = resample([
      { tMs: 0, distance: 0 },
      { tMs: 1000, distance: 0 },
    ])
    expect(Array.from(r.distance)).toEqual([0, 0])
    expect(Array.from(r.speed)).toEqual([0, 0])
  })
})
