import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { combine } from '../digest/combine'
import { digestActivity } from '../digest/digestActivity'
import { AnalysisSession } from '../session'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { noTimeInZones, periodTimeInZones } from './periodTime'
import { ZoneTimeCache } from './timeCache'
import { noon, zoneDigest } from './test/zoneDigests'

const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const withEntries = (measurements: Measurement[]): AthleteSettings => ({
  ...settings,
  measurements,
})

const heartRate = (time: ReturnType<typeof periodTimeInZones>, sport: 'run' | 'ride') =>
  time[sport].find((row) => row.measure === 'heartRate')!

describe('periodTimeInZones', () => {
  it('cuts each activity by the zones in effect on its own date', () => {
    // 150 bpm is 75% of 200 (zone 3) and 83% of 180 (zone 4).
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 180, from: '2026-02-01' },
    ]
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'b', sport: 'run', startMs: noon(2026, 2, 10), heartRate: [150, 900] }),
    ]
    const row = heartRate(periodTimeInZones(digests, withEntries(measurements), null), 'run')
    expect(row.seconds).toEqual([0, 0, 600, 900, 0])
    expect(row.totalSeconds).toBe(1500)
    expect([row.counted, row.entered, row.noData, row.noZones]).toEqual([2, 2, 0, 0])
  })

  it('counts activities without data or without zones, and keeps them out of the seconds', () => {
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
    ]
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'old', sport: 'run', startMs: noon(2026, 1, 11), older: true }),
      zoneDigest({ id: 'none', sport: 'run', startMs: noon(2026, 1, 12) }),
      // Pace has data in this one, but no threshold pace is entered and there is no analysis.
      zoneDigest({ id: 'speed', sport: 'run', startMs: noon(2026, 1, 13), speed: [60, 600] }),
    ]
    const time = periodTimeInZones(digests, withEntries(measurements), null)
    const hr = heartRate(time, 'run')
    expect([hr.counted, hr.noData, hr.noZones]).toEqual([1, 3, 0])
    const pace = time.run.find((row) => row.measure === 'pace')!
    expect([pace.counted, pace.noData, pace.noZones, pace.totalSeconds]).toEqual([0, 3, 1, 0])
  })

  it('leaves a set-aside heart rate out', () => {
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
    ]
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'bad', sport: 'run', startMs: noon(2026, 1, 11), heartRate: [190, 600] }),
    ]
    const row = heartRate(
      periodTimeInZones(digests, withEntries(measurements), null, new Set(['bad'])),
      'run',
    )
    expect([row.counted, row.noData, row.totalSeconds]).toEqual([1, 1, 600])
  })

  it('keeps a sport and a measure apart', () => {
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
      { kind: 'maxHeartRate', sport: 'ride', value: 200, from: '2026-01-01' },
      { kind: 'thresholdPower', sport: 'ride', value: 200, from: '2026-01-01' },
    ]
    const digests = [
      zoneDigest({ id: 'r', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 100] }),
      zoneDigest({
        id: 'c',
        sport: 'ride',
        startMs: noon(2026, 1, 10),
        heartRate: [150, 200],
        power: [40, 300],
      }),
    ]
    const time = periodTimeInZones(digests, withEntries(measurements), null)
    expect(heartRate(time, 'run').totalSeconds).toBe(100)
    expect(heartRate(time, 'ride').totalSeconds).toBe(200)
    // 200 W bins of 5 W: bin 40 is 200-205 W, 100-102% of 200 W, zone 4.
    expect(time.ride.find((row) => row.measure === 'power')!.seconds).toEqual([
      0, 0, 0, 300, 0, 0, 0,
    ])
  })

  it('uses estimated zones from the analysis for what was not entered', () => {
    const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
    const result = combine(digests, settings)
    const time = periodTimeInZones(digests, settings, result)
    const rows = [...time.run, ...time.ride]
    for (const row of rows) {
      expect(row.entered).toBe(0)
      expect(row.counted).toBeGreaterThan(0)
      const sum = row.seconds.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(row.totalSeconds, 6)
    }
  })

  it('has a row for every measure of both sports when there is nothing', () => {
    const empty = periodTimeInZones([], settings, null)
    expect(empty).toEqual(noTimeInZones())
    expect(empty.run.map((row) => row.measure)).toEqual(['heartRate', 'pace'])
    expect(empty.ride.map((row) => row.measure)).toEqual(['heartRate', 'power'])
  })
})

describe('ZoneTimeCache', () => {
  const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
  const analysis = combine(digests, settings)

  it('answers again from the same inputs without working it out again', () => {
    const cache = new ZoneTimeCache()
    const first = cache.get(digests, [], settings, analysis)
    expect(cache.get(digests, [], { ...settings }, analysis)).toBe(first)
  })

  it('works it out again when a dated setting, the digests or the analysis change', () => {
    const cache = new ZoneTimeCache()
    const first = cache.get(digests, [], settings, analysis)
    const entry: Measurement = {
      kind: 'maxHeartRate',
      sport: 'run',
      value: 190,
      from: '2020-01-01',
    }
    const entered = cache.get(digests, [], withEntries([entry]), analysis)
    expect(entered).not.toBe(first)
    expect(cache.get(digests.slice(1), [], withEntries([entry]), analysis)).not.toBe(entered)
    expect(cache.get(digests, [], withEntries([entry]), { ...analysis })).not.toBe(entered)
  })

  it('has no previous period for all time', () => {
    expect(new ZoneTimeCache().get(digests, [], settings, analysis).previous).toBeNull()
  })

  it('cuts the period before by the same estimated zones', () => {
    const half = Math.floor(digests.length / 2)
    const times = new ZoneTimeCache().get(
      digests.slice(half),
      digests.slice(0, half),
      settings,
      analysis,
    )
    expect(times.previous).not.toBeNull()
  })
})

describe('AnalysisSession time in zones', () => {
  it('gives the period and the one before from the session', () => {
    const session = new AnalysisSession()
    const state = session.loadSample(settings)
    const counted = [...state.timeInZones.current.run, ...state.timeInZones.current.ride].reduce(
      (n, row) => n + row.counted,
      0,
    )
    expect(counted).toBeGreaterThan(0)
  })

  it('is empty with nothing loaded', () => {
    const state = new AnalysisSession().setRange('all', settings)
    expect(state.timeInZones.current.run.every((row) => row.counted === 0)).toBe(true)
  })
})
