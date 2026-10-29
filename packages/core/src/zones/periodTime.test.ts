import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { combine } from '../digest/combine'
import { digestActivity } from '../digest/digestActivity'
import { AnalysisSession } from '../session'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { noTimeInZones, periodTimeInZones } from './periodTime'
import { sameEnteredReferences } from './zoneShares'
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
    expect([row.counted, row.setAside, row.noData, row.totalSeconds]).toEqual([1, 1, 0, 600])
  })

  it('counts a set-aside heart rate apart from one that was never recorded', () => {
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
    ]
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'bad', sport: 'run', startMs: noon(2026, 1, 11), heartRate: [190, 600] }),
      zoneDigest({ id: 'none', sport: 'run', startMs: noon(2026, 1, 12) }),
    ]
    const row = heartRate(
      periodTimeInZones(digests, withEntries(measurements), null, new Set(['bad'])),
      'run',
    )
    expect([row.counted, row.setAside, row.noData]).toEqual([1, 1, 1])
  })

  it('records the references the athlete entered, so two periods can be told apart', () => {
    const measurements: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 180, from: '2026-02-01' },
    ]
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'b', sport: 'run', startMs: noon(2026, 1, 20), heartRate: [150, 600] }),
      zoneDigest({ id: 'c', sport: 'run', startMs: noon(2026, 2, 10), heartRate: [150, 600] }),
    ]
    const row = heartRate(periodTimeInZones(digests, withEntries(measurements), null), 'run')
    expect(row.enteredReferences).toEqual([180, 200])
  })

  describe('a dated setting that starts part-way through a period', () => {
    const digests = [
      zoneDigest({ id: 'a', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'b', sport: 'run', startMs: noon(2026, 1, 20), heartRate: [150, 600] }),
      zoneDigest({ id: 'c', sport: 'run', startMs: noon(2026, 2, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'd', sport: 'run', startMs: noon(2026, 2, 20), heartRate: [150, 600] }),
    ]
    const [january, february] = [digests.slice(0, 2), digests.slice(2)]
    const row = (list: typeof digests, entries: Measurement[]) =>
      heartRate(periodTimeInZones(list, withEntries(entries), null), 'run')

    it('applies the earliest entry before its date, so a lone entry puts both periods in the same zones', () => {
      // Entered from 15 January: the 10 January run is before it, and the earliest entry applies.
      const entries: Measurement[] = [
        { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-15' },
      ]
      const [before, after] = [row(january, entries), row(february, entries)]
      expect(before.enteredReferences).toEqual([200])
      expect(after.enteredReferences).toEqual([200])
      expect([before.counted, before.entered]).toEqual([2, 2])
      expect(sameEnteredReferences(before, after)).toBe(true)
    })

    it('puts the periods in different zones when a second entry starts between them', () => {
      const entries: Measurement[] = [
        { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-15' },
        { kind: 'maxHeartRate', sport: 'run', value: 180, from: '2026-02-01' },
      ]
      const [before, after] = [row(january, entries), row(february, entries)]
      expect([before.enteredReferences, after.enteredReferences]).toEqual([[200], [180]])
      expect(sameEnteredReferences(before, after)).toBe(false)
    })

    it('does not compare a period cut by an entry with one that had none', () => {
      const entries: Measurement[] = [
        { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2026-01-15' },
      ]
      const estimates = {
        runCp: null,
        rideCp: null,
        runMaxHeartRate: 190,
        rideMaxHeartRate: null,
        runObservedMaxHeartRate: 190,
        rideObservedMaxHeartRate: null,
      }
      const entered = row(january, entries)
      const estimated = heartRate(periodTimeInZones(february, settings, estimates), 'run')
      expect(estimated.entered).toBe(0)
      expect(sameEnteredReferences(entered, estimated)).toBe(false)
    })
  })

  it('leaves an estimated reference out, even one that moves with a dated weight', () => {
    const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
    const result = combine(digests, settings)
    const heavier = withEntries([
      { kind: 'massKg', value: 90, from: '2020-01-01' },
      { kind: 'massKg', value: 70, from: '2025-06-01' },
    ])
    const time = periodTimeInZones(digests, heavier, result)
    const power = time.ride.find((row) => row.measure === 'power')!
    expect(power.counted).toBeGreaterThan(0)
    expect(power.enteredReferences).toEqual([])
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
    const first = cache.get(digests, [], settings, analysis, analysis.heartRateSetAside)
    expect(cache.get(digests, [], { ...settings }, analysis, analysis.heartRateSetAside)).toBe(
      first,
    )
  })

  it('works it out again when a dated setting, the digests or the analysis change', () => {
    const cache = new ZoneTimeCache()
    const first = cache.get(digests, [], settings, analysis, analysis.heartRateSetAside)
    const entry: Measurement = {
      kind: 'maxHeartRate',
      sport: 'run',
      value: 190,
      from: '2020-01-01',
    }
    const entered = cache.get(
      digests,
      [],
      withEntries([entry]),
      analysis,
      analysis.heartRateSetAside,
    )
    expect(entered).not.toBe(first)
    expect(
      cache.get(digests.slice(1), [], withEntries([entry]), analysis, analysis.heartRateSetAside),
    ).not.toBe(entered)
    expect(
      cache.get(digests, [], withEntries([entry]), { ...analysis }, analysis.heartRateSetAside),
    ).not.toBe(entered)
  })

  it('keeps the last few periods, so going back to one already shown is answered again', () => {
    const cache = new ZoneTimeCache()
    const periods = [3, 6, 9, 12].map((count) => digests.slice(0, count))
    const aside = analysis.heartRateSetAside
    const first = periods.map((selected) => cache.get(selected, [], settings, analysis, aside))
    // Switching back and forth between the four costs nothing.
    for (const index of [0, 2, 1, 3, 0]) {
      expect(cache.get(periods[index]!, [], settings, analysis, aside)).toBe(first[index])
    }
    // A fifth period pushes out the one used longest ago (the third), and no other.
    const fifth = digests.slice(0, 14)
    cache.get(fifth, [], settings, analysis, aside)
    expect(cache.get(periods[0]!, [], settings, analysis, aside)).toBe(first[0])
    expect(cache.get(periods[1]!, [], settings, analysis, aside)).toBe(first[1])
    expect(cache.get(periods[2]!, [], settings, analysis, aside)).not.toBe(first[2])
  })

  it('lets go of its results when cleared', () => {
    const cache = new ZoneTimeCache()
    const aside = analysis.heartRateSetAside
    const first = cache.get(digests, [], settings, analysis, aside)
    cache.clear()
    const again = cache.get(digests, [], settings, analysis, aside)
    expect(again).not.toBe(first)
    expect(again).toEqual(first)
  })

  it('does not answer one period from another, or from other settings or set-aside', () => {
    const cache = new ZoneTimeCache()
    const aside = analysis.heartRateSetAside
    const a = cache.get(digests.slice(0, 5), [], settings, analysis, aside)
    const b = cache.get(digests.slice(0, 5), digests.slice(5, 9), settings, analysis, aside)
    expect(b).not.toBe(a)
    expect(b.previous).not.toBeNull()
    expect(cache.get(digests.slice(0, 5), [], settings, analysis, [...aside])).not.toBe(a)
    expect(
      cache.get(digests.slice(0, 5), [], { ...settings, massKg: 60 }, analysis, aside),
    ).not.toBe(a)
    expect(cache.get(digests.slice(0, 5), [], settings, analysis, aside)).toBe(a)
  })

  it("judges every period's heart rate by the library's set-aside, not the period on screen's", () => {
    const entries: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 200, from: '2020-01-01' },
    ]
    const current = [
      zoneDigest({ id: 'now', sport: 'run', startMs: noon(2026, 3, 10), heartRate: [150, 600] }),
    ]
    const before = [
      zoneDigest({ id: 'old', sport: 'run', startMs: noon(2026, 1, 10), heartRate: [150, 600] }),
      zoneDigest({ id: 'junk', sport: 'run', startMs: noon(2026, 1, 11), heartRate: [195, 600] }),
    ]
    // The period on screen has nothing set aside; the judgement over the library, which holds the earlier
    // period, set 'junk' aside.
    const times = new ZoneTimeCache().get(current, before, withEntries(entries), analysis, ['junk'])
    const row = times.previous!.run.find((each) => each.measure === 'heartRate')!
    expect([row.counted, row.setAside, row.totalSeconds]).toEqual([1, 1, 600])
  })

  it('has no previous period for all time', () => {
    expect(
      new ZoneTimeCache().get(digests, [], settings, analysis, analysis.heartRateSetAside).previous,
    ).toBeNull()
  })

  it('cuts the period before by the same estimated zones', () => {
    const half = Math.floor(digests.length / 2)
    const times = new ZoneTimeCache().get(
      digests.slice(half),
      digests.slice(0, half),
      settings,
      analysis,
      analysis.heartRateSetAside,
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

  it("follows the library's set-aside whatever period is on screen", () => {
    const session = new AnalysisSession()
    session.loadSample(settings)
    const all = session.setRange('all', settings)
    expect(all.heartRateJudgement.setAside).toEqual(all.result?.heartRateSetAside)
    const narrow = session.setRange(30, settings)
    expect(narrow.timeInZones.previous).not.toBeNull()
    expect(narrow.heartRateJudgement.setAside).toEqual(all.result?.heartRateSetAside)
  })

  it('is empty with nothing loaded', () => {
    const state = new AnalysisSession().setRange('all', settings)
    expect(state.timeInZones.current.run.every((row) => row.counted === 0)).toBe(true)
  })
})
