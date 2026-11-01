import { describe, expect, it } from 'vitest'
import { DAY_MS, SAME_HEART_RATE } from '../constants'
import { sameHeartRate } from './sameHeartRate'
import { MONDAY, revised, weeksOf, withBlocks } from './test/sameHeartRateFixture'

const WEEK_MS = 7 * DAY_MS
const NONE = new Set<string>()

describe('a quiet month reaches back further', () => {
  // One ride a week: a 28-day window holds four activities, under the six a week needs.
  const quiet = weeksOf('ride', 14, () => 1, undefined, 1)

  it('reads 56 days where 28 hold under six activities, and marks the week', () => {
    const { weeks, reportedWeeks } = sameHeartRate(quiet, NONE, {}).ride
    expect(reportedWeeks).toBeGreaterThan(4)
    const reported = weeks.filter((week) => week.fit !== null)
    expect(reported.every((week) => week.wide === true)).toBe(true)
    for (const week of reported) expect(week.activities).toBeGreaterThanOrEqual(6)
  })

  it('keeps a week that has the activities at 28 days as it was, with no mark', () => {
    const busy = weeksOf('ride', 12, () => 1)
    const { weeks } = sameHeartRate(busy, NONE, {}).ride
    expect(weeks.some((week) => week.fit !== null)).toBe(true)
    expect(weeks.every((week) => !('wide' in week))).toBe(true)
  })

  it('still stops a week whose heart rate hardly varies', () => {
    const steady = revised(quiet, (d) => ({
      hrBlocks: d.hrBlocks.map((b, i) => ({ ...b, heartRate: 140 + (i % 2) })),
    }))
    const result = sameHeartRate(steady, NONE, {}).ride
    expect(result.reportedWeeks).toBe(0)
    expect(result.lacks).toBe('spread')
  })

  it('stays at 28 days when reaching back finds nothing more, and names what is missing', () => {
    const few = [0, 1, 2].map((i) =>
      withBlocks('ride', `few-${i}`, MONDAY + i * 6 * DAY_MS, [
        { heartRate: 130, output: 200 },
        { heartRate: 150, output: 240 },
      ]),
    )
    const { weeks, lacks } = sameHeartRate(few, NONE, { fromMs: MONDAY - 40 * DAY_MS }).ride
    expect(weeks.every((week) => !('wide' in week))).toBe(true)
    expect(lacks).toBe('blocks')
  })
})

describe('a period with no week to draw', () => {
  const year = weeksOf('ride', 30, () => 1)
  const FROM = MONDAY + 27 * WEEK_MS
  const period = year.filter((d) => d.startMs >= FROM)

  it('reads the library’s newest weeks, which reach before the period, and says so', () => {
    const result = sameHeartRate(period, NONE, { fromMs: FROM, library: year }).ride
    expect(result.scope).toBe('library')
    expect(result.reportedWeeks).toBeGreaterThanOrEqual(2)
    expect(result.weeks[0]!.endMs).toBeLessThan(FROM)
    expect(result.referenceHeartRate).toBe(sameHeartRate(year, NONE, {}).ride.referenceHeartRate)
    expect(result.lacks).toBeNull()
  })

  it('takes the newest year of the library at most', () => {
    const long = weeksOf('ride', 90, () => 1)
    const from = MONDAY + 88 * WEEK_MS
    const result = sameHeartRate(
      long.filter((d) => d.startMs >= from),
      NONE,
      { fromMs: from, library: long },
    ).ride
    expect(result.scope).toBe('library')
    expect(result.weeks.length).toBeLessThanOrEqual(SAME_HEART_RATE.maxWeeks)
  })

  it('reads the library when the period holds none of the sport’s steady stretches', () => {
    const run = withBlocks('run', 'only-run', FROM + DAY_MS, [])
    const result = sameHeartRate([run], NONE, { fromMs: FROM, library: [...year, run] }).ride
    expect(result.scope).toBe('library')
    expect(result.reportedWeeks).toBeGreaterThanOrEqual(2)
  })

  it('leaves a period that draws on its own as it is, with no scope', () => {
    const own = sameHeartRate(year, NONE, { fromMs: MONDAY, library: year }).ride
    expect(own.reportedWeeks).toBeGreaterThanOrEqual(2)
    expect('scope' in own).toBe(false)
  })

  it('keeps the period’s own lack when the library cannot draw either', () => {
    const short = weeksOf('ride', 3, () => 1)
    const result = sameHeartRate(short, NONE, { fromMs: MONDAY, library: short }).ride
    expect('scope' in result).toBe(false)
    expect(result.lacks).toBe('period')
  })

  it('does not fall back when the library’s heart rate hardly varies', () => {
    const steady = revised(year, (d) => ({
      hrBlocks: d.hrBlocks.map((b, i) => ({ ...b, heartRate: 140 + (i % 2) })),
    }))
    const result = sameHeartRate(
      steady.filter((d) => d.startMs >= FROM),
      NONE,
      { fromMs: FROM, library: steady },
    ).ride
    expect(result.reportedWeeks).toBe(0)
    expect('scope' in result).toBe(false)
  })
})

describe('all time', () => {
  const long = weeksOf('ride', 80, () => 1)

  it('reports every week, where a period reports its newest year', () => {
    const all = sameHeartRate(long, NONE, {}).ride
    expect(all.weeks.length).toBeGreaterThan(SAME_HEART_RATE.maxWeeks)
    expect(all.reportedWeeks).toBe(all.weeks.length)
    const period = sameHeartRate(long, NONE, { fromMs: MONDAY }).ride
    expect(period.weeks.length).toBe(SAME_HEART_RATE.maxWeeks)
    // The same weeks, read the same.
    const shared = all.weeks.slice(-SAME_HEART_RATE.maxWeeks)
    expect(period.weeks).toEqual(shared)
  })

  it('starts at the sport’s first full window', () => {
    const { weeks } = sameHeartRate(long, NONE, {}).ride
    expect(weeks[0]!.endMs).toBeGreaterThanOrEqual(MONDAY + 28 * DAY_MS)
  })
})
