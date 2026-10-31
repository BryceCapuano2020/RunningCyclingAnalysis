import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import {
  SAMPLE_ATHLETE,
  SAMPLE_CLOCK,
  SAMPLE_REFERENCE_NOW_MS,
  SAMPLE_SEED,
  SAMPLE_SEEDS,
  generateSampleActivity,
  samplePlan,
} from './sampleSeason'
import type { SampleClock } from './sampleSeason'

const plan = samplePlan()
/** Minutes of the local day a start falls at, for a zone `offsetMinutes` east of UTC. */
const minuteOfDay = (startMs: number, offsetMinutes = 0) =>
  (((Math.floor(startMs / 60_000) + offsetMinutes) % 1440) + 1440) % 1440
const weekdayOf = (startMs: number, offsetMinutes = 0) =>
  new Date(startMs + offsetMinutes * 60_000).getUTCDay()
const daysBefore = (clock: SampleClock, startMs: number) => (clock.nowMs - startMs) / DAY_MS

describe('samplePlan', () => {
  it('is the same plan for the same clock and seed, and a different one for another seed', () => {
    expect(samplePlan(SAMPLE_CLOCK, SAMPLE_SEED)).toEqual(plan)
    expect(samplePlan({ nowMs: SAMPLE_REFERENCE_NOW_MS }, SAMPLE_SEED)).toEqual(plan)
    const other = samplePlan(SAMPLE_CLOCK, SAMPLE_SEED + 1)
    expect(other.map((entry) => entry.seed)).not.toEqual(plan.map((entry) => entry.seed))
  })

  it('keeps one plan for every moment of a day', () => {
    const midnight = Math.floor(SAMPLE_REFERENCE_NOW_MS / DAY_MS) * DAY_MS
    expect(samplePlan({ nowMs: midnight })).toEqual(plan)
    expect(samplePlan({ nowMs: midnight + DAY_MS - 1 })).toEqual(plan)
  })

  it('ends on a Sunday at most a week before the clock, and never plans an activity in the future', () => {
    for (const nowMs of [SAMPLE_REFERENCE_NOW_MS, 1_900_000_000_000, 2_100_000_000_000]) {
      const clock = { nowMs }
      const starts = samplePlan(clock).map((entry) => entry.spec.startMs)
      expect(Math.max(...starts)).toBeLessThan(nowMs)
      expect(daysBefore(clock, Math.max(...starts))).toBeLessThanOrEqual(8)
    }
    // The reference clock is a Sunday, so the season ends the Sunday before it: the long run or the day before.
    expect(
      daysBefore(SAMPLE_CLOCK, Math.max(...plan.map((entry) => entry.spec.startMs))),
    ).toBeGreaterThan(6)
    expect(weekdayOf(SAMPLE_REFERENCE_NOW_MS)).toBe(0)
  })

  describe('over fourteen days in a row', () => {
    const clocks = Array.from({ length: 14 }, (_, day) => ({
      nowMs: SAMPLE_REFERENCE_NOW_MS + day * DAY_MS,
    }))
    const plans = clocks.map((clock) => samplePlan(clock))

    /** What a plan is apart from its dates: the sessions, their lengths, hours, forms and draws. */
    const shape = (entries: typeof plan) =>
      entries.map(({ spec, athlete, seed }) => ({
        ...spec,
        startMs: minuteOfDay(spec.startMs),
        athlete,
        seed,
      }))

    it('is the same plan with the same sessions, whatever day of the week it is loaded', () => {
      for (const other of plans) expect(shape(other)).toEqual(shape(plans[0]!))
    })

    it('moves only a whole week at a time, so each session keeps its weekday', () => {
      for (const other of plans) {
        other.forEach((entry, index) => {
          const shift = entry.spec.startMs - plan[index]!.spec.startMs
          expect(shift % (7 * DAY_MS)).toBe(0)
          expect(shift).toBeGreaterThanOrEqual(0)
          expect(shift).toBeLessThanOrEqual(2 * 7 * DAY_MS)
        })
      }
    })

    it('always holds the sessions its story rests on: tests, a race, a time trial, a glitch and rides without power', () => {
      for (const other of plans) {
        const named = (pattern: RegExp) => other.filter((entry) => pattern.test(entry.spec.name))
        expect(named(/^Threshold test/)).toHaveLength(4)
        expect(named(/^Power Test/)).toHaveLength(4)
        expect(named(/^Parkrun/)).toHaveLength(1)
        expect(named(/^Club Time Trial/)).toHaveLength(1)
        expect(other.filter((entry) => entry.spec.hrGlitch === true)).toHaveLength(1)
        expect(other.filter((entry) => entry.spec.withPower === false)).toHaveLength(3)
      }
    })
  })

  it('never skips a featured session at random, whatever the seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, SAMPLE_SEED]) {
      const seeded = samplePlan(SAMPLE_CLOCK, seed)
      expect(
        seeded.filter((entry) => /^Threshold test|^Power Test/.test(entry.spec.name)),
      ).toHaveLength(8)
      expect(seeded.filter((entry) => entry.spec.hrGlitch === true)).toHaveLength(1)
      expect(seeded.filter((entry) => entry.spec.withPower === false)).toHaveLength(3)
      expect(seeded.filter((entry) => entry.noise.behaviour.treadmillShare === 1)).toHaveLength(2)
      // One easy run with no heart rate; the older weeks' hard sessions are recorded without a strap too.
      const noStrap = seeded.filter((entry) => entry.spec.withHeartRate === false)
      expect(noStrap.filter((entry) => entry.spec.effort === 'easy')).toHaveLength(1)
      expect(noStrap.filter((entry) => entry.spec.effort !== 'easy').length).toBeGreaterThan(10)
      expect(seeded.filter((entry) => entry.gap !== undefined)).toHaveLength(1)
    }
  })

  it('lists the seeds of the whole story with the sample’s own first, none twice', () => {
    expect(SAMPLE_SEEDS[0]).toBe(SAMPLE_SEED)
    expect(new Set(SAMPLE_SEEDS).size).toBe(SAMPLE_SEEDS.length)
  })

  it('reaches past a year back, so 12 months and all time differ, with the last 12 weeks fullest', () => {
    const ages = plan.map((entry) => daysBefore(SAMPLE_CLOCK, entry.spec.startMs))
    expect(Math.max(...ages)).toBeGreaterThan(365)
    expect(Math.max(...ages)).toBeLessThan(405)
    const within = (days: number) => ages.filter((age) => age <= days).length
    expect(within(84)).toBeGreaterThanOrEqual(40)
    expect(within(365)).toBeGreaterThan(within(84) + 20)
    expect(plan.length).toBeGreaterThan(within(365))
  })

  it('holds both sports in the last 12 weeks, with several of each', () => {
    const recent = plan.filter((entry) => daysBefore(SAMPLE_CLOCK, entry.spec.startMs) <= 84)
    for (const sport of ['run', 'ride']) {
      expect(recent.filter((entry) => entry.spec.sport === sport).length).toBeGreaterThanOrEqual(15)
    }
  })

  it('holds 40 rides in the last 12 weeks, so the ride page has enough to say, and a second session on Tuesdays', () => {
    const recent = plan.filter(
      (entry) => entry.spec.sport === 'ride' && daysBefore(SAMPLE_CLOCK, entry.spec.startMs) <= 84,
    )
    expect(recent.length).toBeGreaterThanOrEqual(40)
    // A rider's Tuesday: the morning or lunch run, then an evening commute.
    const tuesday = plan.filter((entry) => weekdayOf(entry.spec.startMs) === 2)
    const days = new Map<number, number>()
    for (const entry of tuesday) {
      const day = Math.floor(entry.spec.startMs / DAY_MS)
      days.set(day, (days.get(day) ?? 0) + 1)
    }
    expect([...days.values()].some((count) => count === 2)).toBe(true)
  })

  it('numbers ids in time order, each once', () => {
    const ids = plan.map((entry) => entry.spec.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort())
    const starts = plan.map((entry) => entry.spec.startMs)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('varies the hour of the day: mornings, lunch and evenings on weekdays, mornings at the weekend', () => {
    const minutes = plan.map((entry) => minuteOfDay(entry.spec.startMs))
    expect(new Set(minutes).size).toBeGreaterThan(60)
    expect(minutes.some((m) => m < 7 * 60)).toBe(true)
    expect(minutes.some((m) => m >= 11 * 60 && m < 13 * 60)).toBe(true)
    expect(minutes.some((m) => m >= 17 * 60)).toBe(true)
    // No two activities share a start time of day, as one stamp on every row did.
    expect(new Set(minutes).size / minutes.length).toBeGreaterThan(0.6)
    for (const entry of plan) {
      const weekend = [0, 6].includes(weekdayOf(entry.spec.startMs))
      const minute = minuteOfDay(entry.spec.startMs)
      if (weekend) expect(minute).toBeLessThan(10 * 60)
    }
  })

  it('puts the long sessions at the weekend', () => {
    // A long session is a run of 75 minutes or a ride of 100: the weekday rides are shorter than that.
    const longMinutes = { run: 75, ride: 100 }
    const long = plan.filter(
      (entry) =>
        entry.spec.effort === 'easy' && entry.spec.durationS >= longMinutes[entry.spec.sport] * 60,
    )
    expect(long.length).toBeGreaterThan(20)
    for (const entry of long) expect([0, 6]).toContain(weekdayOf(entry.spec.startMs))
  })

  it('starts at the same local hours in any time zone, and keeps the day through daylight saving', () => {
    const zone = (ms: number) => (ms < SAMPLE_REFERENCE_NOW_MS - 100 * DAY_MS ? -420 : -480)
    const shifted = samplePlan({ nowMs: SAMPLE_REFERENCE_NOW_MS, utcOffsetMinutes: zone })
    expect(shifted).toHaveLength(plan.length)
    shifted.forEach((entry, index) => {
      const offset = zone(entry.spec.startMs)
      const reference = plan[index]!
      // The same local reading in a zone seven or eight hours west is a later instant.
      expect(minuteOfDay(entry.spec.startMs, offset)).toBe(minuteOfDay(reference.spec.startMs))
      expect(weekdayOf(entry.spec.startMs, offset)).toBe(weekdayOf(reference.spec.startMs))
    })
  })

  it('climbs through the season: today’s threshold power is well above the first day’s', () => {
    const power = (entry: (typeof plan)[number]) =>
      entry.athlete.cpRide * entry.athlete.grossEfficiency
    const rides = plan.filter((entry) => entry.spec.sport === 'ride')
    const first = rides.slice(0, 4).map(power)
    const last = rides.slice(-4).map(power)
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    expect(mean(last) / mean(first)).toBeGreaterThan(1.15)
    const runs = plan.filter((entry) => entry.spec.sport === 'run')
    expect(runs.at(-1)!.athlete.cpRun).toBeGreaterThan(runs[0]!.athlete.cpRun)
    expect(Math.abs(rides.at(-1)!.athlete.cpRide / SAMPLE_ATHLETE.cpRide - 1)).toBeLessThan(0.05)
  })

  it('keeps the sample’s features: threshold tests, a ride without power, a heart-rate glitch', () => {
    const named = (name: RegExp) => plan.filter((entry) => name.test(entry.spec.name))
    expect(named(/^Threshold test/).length).toBeGreaterThanOrEqual(3)
    expect(named(/^Power Test/).length).toBeGreaterThanOrEqual(3)
    expect(plan.filter((entry) => entry.spec.withPower === false)).not.toHaveLength(0)
    expect(plan.filter((entry) => entry.spec.hrGlitch === true)).toHaveLength(1)
    for (const entry of plan) {
      expect(entry.spec.name).not.toMatch(/Glitch|Flat|Rolling|With HR|Simulat|Synthetic/)
    }
  })
})

describe('generateSampleActivity', () => {
  it('gives the planned length and the same recording each time', () => {
    const entry = plan.find(
      (candidate) => candidate.spec.effort === 'easy' && candidate.spec.sport === 'run',
    )!
    const first = generateSampleActivity(entry)
    expect(first.n).toBe(entry.spec.durationS)
    expect(first.id).toBe(entry.spec.id)
    expect(generateSampleActivity(entry).speed).toEqual(first.speed)
    expect(generateSampleActivity(plan[1]!).speed).not.toEqual(first.speed)
  })

  it('draws a rise in power: a ride from the end of the season out-produces one from the start', () => {
    const mean = (activity: ReturnType<typeof generateSampleActivity>) =>
      activity.power.reduce((total, w) => total + w, 0) / activity.n
    // An easy ride's power is a drawn share of the athlete's threshold, so the earlier half of them is compared with the later.
    const rides = plan.filter(
      (entry) =>
        entry.spec.sport === 'ride' &&
        entry.spec.effort === 'easy' &&
        entry.spec.withPower !== false,
    )
    const early = rides
      .slice(0, Math.floor(rides.length / 2))
      .map((entry) => mean(generateSampleActivity(entry)))
    const late = rides
      .slice(-Math.floor(rides.length / 2))
      .map((entry) => mean(generateSampleActivity(entry)))
    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    expect(average(late) / average(early)).toBeGreaterThan(1.02)
  })
})
