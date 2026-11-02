import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { noon, zoneDigest } from '../zones/test/zoneDigests'
import { historyOf, NO_HISTORY } from './compute'
import type { HistoryInput } from './types'

// A maximum of 200 bpm cuts the zones at 120, 140, 160 and 180: 110 and 130 are easy, 150 moderate, 170 and 190 hard.
const maxima = (value: number): Measurement[] => [
  { kind: 'maxHeartRate', sport: 'run', value, from: '2020-01-01' },
  { kind: 'maxHeartRate', sport: 'ride', value, from: '2020-01-01' },
]

const input = (over: Partial<HistoryInput> = {}): HistoryInput => ({
  settings: { massKg: 75, bikeMassKg: 9, measurements: maxima(200) },
  setAside: new Set(),
  heartRateSetAside: new Set(),
  estimates: null,
  nowMs: Date.UTC(2030, 0, 1),
  gate: undefined,
  ...over,
})

const intensityOf = (digests: ReturnType<typeof zoneDigest>[], over?: Partial<HistoryInput>) =>
  historyOf(digests, input(over)).intensity

describe('intensity', () => {
  it('splits each year into easy, moderate and hard heart-rate time, sport by sport', () => {
    const rows = intensityOf([
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2025, 3, 10), heartRate: [110, 600] }),
      zoneDigest({ id: 'b', sport: 'run', startMs: noon(2025, 4, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'c', sport: 'run', startMs: noon(2025, 5, 10), heartRate: [170, 1200] }),
      zoneDigest({ id: 'd', sport: 'ride', startMs: noon(2025, 6, 10), heartRate: [130, 1800] }),
    ])
    expect(rows.map((row) => row.year)).toEqual([2025])
    const run = rows[0]!.sports.run
    expect(run.seconds).toBe(2400)
    expect(run.counted).toBe(3)
    expect(run.easy).toBeCloseTo(0.25)
    expect(run.moderate).toBeCloseTo(0.25)
    expect(run.hard).toBeCloseTo(0.5)
    expect(rows[0]!.sports.ride).toMatchObject({ easy: 1, moderate: 0, hard: 0, seconds: 1800 })
  })

  it('gives a year with no heart rate, between two with some, all zeros', () => {
    const rows = intensityOf([
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2023, 6, 1), heartRate: [150, 600] }),
      zoneDigest({ id: 'b', sport: 'run', startMs: noon(2025, 6, 1), heartRate: [150, 600] }),
    ])
    expect(rows.map((row) => row.year)).toEqual([2023, 2024, 2025])
    expect(rows[1]!.sports.run).toEqual({
      easy: 0,
      moderate: 0,
      hard: 0,
      seconds: 0,
      counted: 0,
      noZones: 0,
      activities: 0,
    })
  })

  it('re-cuts every year by the zones the settings give now, not those it was recorded in', () => {
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2025, 3, 10), heartRate: [150, 600] }),
    ]
    // 150 bpm is moderate under a 200 bpm maximum and hard under 180 bpm (zones start at 108, 126, 144 and 162).
    expect(intensityOf(digests)[0]!.sports.run.moderate).toBeCloseTo(1)
    const lower = intensityOf(digests, {
      settings: { massKg: 75, bikeMassKg: 9, measurements: maxima(180) },
    })
    expect(lower[0]!.sports.run.hard).toBeCloseTo(1)
  })

  it("cuts every year by today's zones, so a maximum entered later moves no earlier year", () => {
    // 150 bpm is moderate under the 200 bpm maximum that applied in 2023, and hard under the 180 bpm entered in 2025.
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2020-01-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 180, from: '2025-01-01' },
    ]
    const rows = historyOf(
      [
        zoneDigest({ id: 'old', sport: 'run', startMs: noon(2023, 6, 10), heartRate: [150, 600] }),
        zoneDigest({ id: 'new', sport: 'run', startMs: noon(2025, 6, 10), heartRate: [150, 600] }),
      ],
      input({ settings: { massKg: 75, bikeMassKg: 9, measurements } }),
    ).intensity
    expect(rows.map((row) => row.year)).toEqual([2023, 2024, 2025])
    expect(rows[0]!.sports.run.hard).toBeCloseTo(1)
    expect(rows[2]!.sports.run.hard).toBeCloseTo(1)
  })

  it('leaves out a set-aside heart rate, and not one whose power is set aside', () => {
    const digests = [
      zoneDigest({ id: 'a', sport: 'ride', startMs: noon(2025, 3, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'bad', sport: 'ride', startMs: noon(2025, 3, 11), heartRate: [190, 600] }),
    ]
    const aside = intensityOf(digests, { heartRateSetAside: new Set(['bad']) })[0]!.sports.ride
    expect(aside).toMatchObject({ counted: 1, seconds: 600, hard: 0, moderate: 1 })
    const powerAside = intensityOf(digests, { setAside: new Set(['bad']) })[0]!.sports.ride
    expect(powerAside).toMatchObject({ counted: 2, seconds: 1200 })
  })

  it('counts nothing for an activity with no heart rate, and is empty for no activities', () => {
    const rows = intensityOf([zoneDigest({ id: 'none', sport: 'run', startMs: noon(2025, 3, 1) })])
    expect(rows[0]!.sports.run).toMatchObject({ seconds: 0, counted: 0, noZones: 0, activities: 1 })
    expect(intensityOf([])).toEqual(NO_HISTORY.intensity)
  })

  it('counts a heart rate with no maximum to cut zones from as no zones, not as no heart rate', () => {
    const rows = intensityOf(
      [zoneDigest({ id: 'a', sport: 'ride', startMs: noon(2025, 3, 10), heartRate: [150, 600] })],
      { settings: { massKg: 75, bikeMassKg: 9 } },
    )
    expect(rows[0]!.sports.ride).toMatchObject({ counted: 0, noZones: 1, activities: 1 })
  })

  it('is remembered for the same day, digests and zones, and made again for a new day or set-aside list', () => {
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2025, 3, 10), heartRate: [150, 600] }),
    ]
    const first = historyOf(digests, input()).intensity
    expect(historyOf([...digests], input()).intensity).toBe(first)
    expect(historyOf(digests, input({ nowMs: Date.UTC(2030, 0, 2) })).intensity).not.toBe(first)
    const later = historyOf(digests, input({ heartRateSetAside: new Set(['a']) })).intensity
    expect(later).not.toBe(first)
    expect(later[0]!.sports.run.counted).toBe(0)
  })
})
