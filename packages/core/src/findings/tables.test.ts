import { describe, expect, it } from 'vitest'
import { sameHeartRate } from '../digest/sameHeartRate'
import { weekEndMs } from '../digest/trendPoints'
import { inputAt, latestStartMs, weeklyMarks } from './input'
import { buildTables, coverageShare } from './tables'
import { nullLibrary, plantedLibrary } from './test/plantedLibrary'

const WEEK_MS = 7 * 86_400_000
const library = plantedLibrary({
  seed: 2,
  weeks: 36,
  perWeek: 4,
  noise: 0.02,
  sports: ['run', 'ride'],
  effects: [{ type: 'break', atWeek: 10, size: 3 }],
})

describe('buildTables', () => {
  const input = inputAt(library)

  it('has the same-heart-rate fits of the whole library, as sameHeartRate gives them', () => {
    expect(input.tables.sameHeartRate).toEqual(sameHeartRate(input.digests, new Set(), {}))
    expect(input.tables.sameHeartRate.run.weeks.length).toBeGreaterThan(20)
  })

  it("has every week from the sport's first to the last, quiet weeks as zero", () => {
    const run = input.tables.weeklyMoving.run
    expect(run).toHaveLength(36)
    expect(run.map((w) => w.endMs)).toEqual(
      Array.from({ length: 36 }, (_, i) => weekEndMs(library.firstMs) + i * WEEK_MS),
    )
    expect(run.slice(10, 13).map((w) => w.seconds)).toEqual([0, 0, 0])
    expect(run.slice(10, 13).map((w) => w.activities)).toEqual([0, 0, 0])
    expect(run[0]!.activities).toBe(2)
    const runs = input.digests.filter((d) => d.sport === 'run')
    expect(run.reduce((s, w) => s + w.seconds, 0)).toBe(runs.reduce((s, d) => s + d.movingS!, 0))
  })

  it('marks the week asOfMs falls in as incomplete until its Sunday', () => {
    const sunday = inputAt(library, weekEndMs(library.lastMs))
    expect(sunday.tables.weeklyMoving.run.every((w) => w.complete)).toBe(true)
    // At the newest activity, which is mid-week, the last week is part of one.
    expect(input.tables.weeklyMoving.run.at(-1)!.complete).toBe(false)
    // Wednesday of the eighth week: its Monday and Wednesday activities are in, its weekend is not.
    const wednesday = library.firstMs + 7 * WEEK_MS + 2 * 86_400_000
    const mid = inputAt(library, wednesday)
    const weeks = mid.tables.weeklyMoving.run
    expect(weeks.at(-1)!.complete).toBe(false)
    expect(weeks.at(-1)!.endMs).toBe(weekEndMs(wednesday))
    expect(weeks.slice(0, -1).every((w) => w.complete)).toBe(true)
    expect(mid.tables.coverage.run.at(-1)!.complete).toBe(false)
    expect(weeks.at(-1)!.seconds).toBeLessThan(weeks.at(-2)!.seconds)
  })

  it('reaches the week of asOfMs when the library has gone quiet, and falls back to duration without moving time', () => {
    const quiet = buildTables(input.digests, new Set(), input.asOfMs + 5 * WEEK_MS)
    expect(quiet.weeklyMoving.run).toHaveLength(36 + 5)
    expect(quiet.weeklyMoving.run.at(-1)!.seconds).toBe(0)
    const old = input.digests.map((d) => ({ ...d, movingS: undefined }))
    const tables = buildTables(old, new Set(), input.asOfMs)
    expect(tables.weeklyMoving.run[0]!.seconds).toBeGreaterThan(
      input.tables.weeklyMoving.run[0]!.seconds,
    )
  })

  it('has steady-effort drift without the activities whose heart rate is set aside', () => {
    const drift = input.tables.drift.run
    expect(drift.length).toBeGreaterThan(10)
    const aside = drift[3]!.activityId
    const without = buildTables(input.digests, new Set([aside]), input.asOfMs)
    expect(without.drift.run.some((p) => p.activityId === aside)).toBe(false)
    expect(without.drift.run).toHaveLength(drift.length - 1)
    expect(without.drift.ride).toHaveLength(input.tables.drift.ride.length)
  })

  it("has each sport's durability rows and first activity", () => {
    expect(input.tables.durability.run.map((r) => r.durationS)).toEqual([300, 1200])
    expect(input.tables.durability.ride[1]!.after[0]!.retention).toBeGreaterThan(0.5)
    expect(input.tables.firstMs.run).toBe(input.digests.find((d) => d.sport === 'run')!.startMs)
    const rideOnly = buildTables(
      input.digests.filter((d) => d.sport === 'ride'),
      new Set(),
      input.asOfMs,
    )
    expect(rideOnly.firstMs.run).toBeNull()
    expect(rideOnly.weeklyMoving.run).toEqual([])
  })
})

describe('coverage and changes of source', () => {
  const spec = { seed: 4, weeks: 52, perWeek: 4, noise: 0.02 }

  it('counts the activities with heart rate and measured power each week', () => {
    const ride = plantedLibrary({ ...spec, sports: ['run', 'ride'], effects: [] })
    const { coverage } = inputAt(ride).tables
    expect(coverage.run[0]).toMatchObject({
      activities: 2,
      withHeartRate: 2,
      withMeasuredPower: 0,
      complete: true,
    })
    expect(coverage.ride[0]).toMatchObject({
      activities: 2,
      withHeartRate: 2,
      withMeasuredPower: 2,
    })
    expect(coverageShare(coverage.run, 'heartRate', { fromMs: 0, toMs: Infinity })).toBe(1)
    expect(coverageShare(coverage.run, 'power', { fromMs: 0, toMs: Infinity })).toBe(0)
    expect(coverageShare(coverage.run, 'power', { fromMs: 0, toMs: 1 })).toBeNaN()
  })

  it('finds the step when half of the activities from a week on have no heart rate', () => {
    const lib = plantedLibrary({
      ...spec,
      effects: [{ type: 'hr-coverage', atWeek: 26, size: 0.6 }],
    })
    const input = inputAt(lib)
    const [change] = input.tables.sourceChanges.run
    expect(input.tables.sourceChanges.run).toHaveLength(1)
    expect(change).toMatchObject({ source: 'heartRate', before: 1 })
    expect(change!.after).toBeGreaterThan(0.25)
    expect(change!.after).toBeLessThan(0.55)
    const weeksFromOnset = (change!.atMs - lib.truths[0]!.onsetMs) / WEEK_MS
    expect(Math.abs(weeksFromOnset - 1)).toBeLessThanOrEqual(2)
    const before = { fromMs: lib.firstMs, toMs: lib.truths[0]!.onsetMs }
    const after = { fromMs: lib.truths[0]!.onsetMs, toMs: lib.lastMs + WEEK_MS }
    expect(coverageShare(input.tables.coverage.run, 'heartRate', before)).toBe(1)
    expect(coverageShare(input.tables.coverage.run, 'heartRate', after)).toBeLessThan(0.55)
  })

  it('finds no step in libraries where nothing about the recording changes, even when 30% lack heart rate', () => {
    for (const perWeek of [1, 2, 4]) {
      for (const nuisances of [[], ['missing-hr' as const]]) {
        const lib = nullLibrary({ seed: 7, weeks: 78, perWeek, nuisances })
        expect(inputAt(lib).tables.sourceChanges.run, `${perWeek} a week, ${nuisances}`).toEqual([])
      }
    }
  })
})

describe('inputAt', () => {
  it('takes the digests of the current model up to the date, in canonical order', () => {
    const stale = { ...library.digests[0]!, id: 'stale', modelRevision: 0 }
    const shuffled = [stale, ...[...library.digests].reverse()]
    const asOfMs = library.digests[100]!.startMs
    const input = inputAt({ digests: shuffled, setAside: new Set() }, asOfMs)
    expect(input.asOfMs).toBe(asOfMs)
    expect(input.digests.map((d) => d.id)).toEqual(
      library.digests.filter((d) => d.startMs <= asOfMs).map((d) => d.id),
    )
    expect(input.zones).toBeUndefined()
  })

  it('takes "now" from the newest activity when no date is given, never the clock', () => {
    expect(inputAt(library).asOfMs).toBe(library.lastMs)
    expect(latestStartMs(library.digests)).toBe(library.lastMs)
    expect(latestStartMs([])).toBe(0)
  })

  it('makes the weeks of the zone tables from the activities up to a date in the middle of a week', () => {
    // Wednesday of the 15th week: the run on that day is in, the run on its Saturday is not.
    const wednesday = library.firstMs + 14 * WEEK_MS + 2 * 86_400_000
    const mid = inputAt(library, wednesday).zones!
    const full = inputAt(library, weekEndMs(wednesday)).zones!
    const endMs = weekEndMs(wednesday)
    const total = (week: { easyS: number; middleS: number; hardS: number }) =>
      week.easyS + week.middleS + week.hardS
    const week = mid.weeks.run.find((w) => w.endMs === endMs)!
    const thatWeek = mid.activities.filter(
      (a) => a.sport === 'run' && weekEndMs(a.startMs) === endMs,
    )
    expect(thatWeek).toHaveLength(1)
    expect(total(week)).toBe(thatWeek.reduce((sum, a) => sum + a.easyS + a.middleS + a.hardS, 0))
    expect(total(week)).toBeLessThan(total(full.weeks.run.find((w) => w.endMs === endMs)!) - 1)
    expect(mid.weeks.run.at(-1)!.endMs).toBe(endMs)
  })

  it('cuts the zone tables at the date', () => {
    const asOfMs = library.firstMs + 10 * WEEK_MS
    const input = inputAt(library, asOfMs)
    expect(input.zones!.activities.every((a) => a.startMs <= asOfMs)).toBe(true)
    expect(input.zones!.weeks.run.every((w) => w.endMs <= weekEndMs(asOfMs))).toBe(true)
    expect(input.zones!.activities.length).toBeLessThan(library.zones.activities.length)
    const easy = input.zones!.activities.filter((a) => a.sport === 'run')
    expect(easy.every((a) => a.easyS + a.middleS + a.hardS > 0.9 * a.movingS)).toBe(true)
  })
})

describe('weeklyMarks', () => {
  it("is the Sunday end of each week from the first activity's to the last's", () => {
    const marks = weeklyMarks(library.digests)
    expect(marks).toHaveLength(36)
    expect(marks.every((m) => new Date(m).getUTCDay() === 0)).toBe(true)
    expect(marks.every((m, i) => i === 0 || m - marks[i - 1]! === WEEK_MS)).toBe(true)
    expect(weeklyMarks(library.digests, { fromMs: marks[5], toMs: marks[9] })).toEqual(
      marks.slice(5, 10),
    )
    expect(weeklyMarks([])).toEqual([])
  })
})
