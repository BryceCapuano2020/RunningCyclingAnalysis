import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import {
  BREAK_AFTER_WEEKS,
  COMPRESS_AFTER_WEEKS,
  MONTHLY_AFTER_DAYS,
  inGap,
  isMonthly,
  lineBreaks,
  monthGroups,
  rowBreaks,
  thinTrend,
  timeAxisOf,
} from './trendSeries'

const WEEK = 7 * DAY_MS
/** Sunday 7 January 2024, 23:59:59.999 UTC: a week's end. */
const START = Date.UTC(2024, 0, 8) - 1

interface Row {
  endMs: number
  a: number | null
  b: number | null
  note: string
}

const row = (week: number, a: number | null, b: number | null = null): Row => ({
  endMs: START + week * WEEK,
  a,
  b,
  note: `w${week}`,
})

describe('isMonthly', () => {
  it('is false up to 26 weeks of weeks drawn and true beyond', () => {
    const weeklyEnds = (count: number) => Array.from({ length: count }, (_, i) => START + i * WEEK)
    expect(isMonthly(weeklyEnds(27))).toBe(false)
    expect(isMonthly(weeklyEnds(28))).toBe(true)
    expect(MONTHLY_AFTER_DAYS).toBe(182)
    expect(isMonthly([])).toBe(false)
  })

  it('counts the weeks drawn, not the time between them, so a skipped year does not make a short series monthly', () => {
    const ends = [...Array.from({ length: 10 }, (_, i) => START + i * WEEK)]
    ends.push(...Array.from({ length: 10 }, (_, i) => START + (80 + i) * WEEK))
    expect(isMonthly(ends)).toBe(false)
  })
})

describe('monthGroups', () => {
  it('groups weeks by the UTC month they end in, covering each week once', () => {
    const ends = Array.from({ length: 12 }, (_, week) => START + week * WEEK)
    const groups = monthGroups(ends)
    // Weeks ending 7, 14, 21, 28 Jan; 4, 11, 18, 25 Feb; 3, 10, 17, 24 Mar.
    expect(groups).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ])
  })
})

describe('thinTrend', () => {
  const weeks = Array.from({ length: 60 }, (_, week) => row(week, week % 2 === 0 ? 10 : 20))

  it('keeps every week of a span of 26 weeks or less', () => {
    const { rows, monthly } = thinTrend(weeks.slice(0, 27), ['a'])
    expect(monthly).toBe(false)
    expect(rows).toHaveLength(27)
    expect(rows[3]).toEqual({ row: weeks[3], weeks: [3] })
  })

  it('gives a row a month past 26 weeks: the mean of its weeks, dated at the last of them', () => {
    const { rows, monthly } = thinTrend(weeks, ['a'])
    expect(monthly).toBe(true)
    // Weeks 0 to 3 end in January: 10, 20, 10, 20.
    expect(rows[0]?.weeks).toEqual([0, 1, 2, 3])
    expect(rows[0]?.row.a).toBe(15)
    expect(rows[0]?.row.endMs).toBe(weeks[3]?.endMs)
    expect(rows[0]?.row.note).toBe('w3')
    expect(rows.length).toBeLessThan(20)
  })

  it('averages only the weeks that have a value, and leaves a month with none null', () => {
    const sparse = weeks.map((w, i) => ({
      ...w,
      a: i < 4 ? null : i < 8 ? (i === 5 ? 12 : null) : 30,
    }))
    const { rows } = thinTrend(sparse, ['a', 'b'])
    expect(rows[0]?.row.a).toBeNull()
    expect(rows[1]?.row.a).toBe(12)
    expect(rows[0]?.row.b).toBeNull()
  })

  it('makes the final row the final week itself, not the mean of its month', () => {
    const last = weeks.at(-1)!
    const { rows } = thinTrend(weeks, ['a'])
    expect(rows.at(-1)?.row).toEqual(last)
    // The final month's weeks are still the ones its row stands for, so a volume bar can average them.
    expect(rows.at(-1)?.weeks.at(-1)).toBe(weeks.length - 1)
    expect(rows.at(-1)?.weeks.length).toBeGreaterThan(0)
  })

  it('makes the final row the final week, so a field it lacks is null there and not an earlier week of the month', () => {
    // The last week has no value of a, though the one before it, in the same month, does; b has one in the last.
    const gap = weeks.map((w, i) =>
      i === weeks.length - 1
        ? Object.assign({}, w, { a: null, b: 7 })
        : Object.assign({}, w, { b: null }),
    )
    const { rows } = thinTrend(gap, ['a', 'b'])
    const final = rows.at(-1)!.row
    expect(final.a).toBeNull()
    expect(final.b).toBe(7)
    // The month before it is still an average, dated where its data is.
    expect(rows.at(-2)?.row.a).not.toBeNull()
    expect(rows[0]?.row.b).toBeNull()
  })

  it('keeps every week index exactly once across the rows', () => {
    const { rows } = thinTrend(weeks, ['a'])
    expect(rows.flatMap((r) => r.weeks)).toEqual(weeks.map((_, i) => i))
  })
})

describe('lineBreaks', () => {
  const valued = (pattern: string) => [...pattern].map((c) => c === 'x')

  it('does not break the first valued week, nor a week with no value', () => {
    expect(lineBreaks(valued('--x-x'))).toEqual([false, false, false, false, false])
  })

  it('bridges seven empty weeks and breaks at eight', () => {
    const gap = (empty: number) => lineBreaks(valued(`x${'-'.repeat(empty)}x`)).at(-1)
    expect(BREAK_AFTER_WEEKS).toBe(8)
    expect(gap(BREAK_AFTER_WEEKS - 1)).toBe(false)
    expect(gap(BREAK_AFTER_WEEKS)).toBe(true)
  })

  it('marks only the week that resumes after the gap', () => {
    const flags = lineBreaks(valued(`xx${'-'.repeat(10)}xx`))
    expect(flags.filter(Boolean)).toHaveLength(1)
    expect(flags[12]).toBe(true)
  })
})

describe('rowBreaks', () => {
  it('breaks a monthly row when a week it stands for breaks, and not otherwise', () => {
    const weeks = Array.from({ length: 60 }, (_, week) =>
      row(week, week < 20 || week > 40 ? 1 : null),
    )
    const flags = lineBreaks(weeks.map((w) => w.a !== null))
    const { rows } = thinTrend(weeks, ['a'])
    const broken = rowBreaks(rows, flags)
    expect(broken.filter(Boolean)).toHaveLength(1)
    const at = broken.indexOf(true)
    expect(rows[at]?.weeks).toContain(41)
  })
})

describe('timeAxisOf', () => {
  const ends = (n: number) => Array.from({ length: n }, (_, i) => START + i * WEEK)
  const active = (n: number, on: (i: number) => boolean) =>
    Array.from({ length: n }, (_, i) => on(i))

  it('starts at the first active week and stops at the last, leaving a quiet start and end off', () => {
    const axis = timeAxisOf(
      ends(30),
      active(30, (i) => i >= 5 && i <= 20),
    )
    expect(axis).toEqual({ startMs: START + 5 * WEEK, endMs: START + 20 * WEEK, gaps: [] })
  })

  it('is null with nothing active', () => {
    expect(
      timeAxisOf(
        ends(10),
        active(10, () => false),
      ),
    ).toBeNull()
  })

  it('skips a stretch of a year or more of inactive weeks, and keeps a shorter one', () => {
    const quiet = (empty: number) =>
      timeAxisOf(
        ends(80 + empty),
        active(80 + empty, (i) => i < 10 || i >= 10 + empty),
      )
    expect(COMPRESS_AFTER_WEEKS).toBe(52)
    expect(quiet(COMPRESS_AFTER_WEEKS - 1)?.gaps).toEqual([])
    expect(quiet(COMPRESS_AFTER_WEEKS)?.gaps).toEqual([
      { fromMs: START + 9 * WEEK, toMs: START + (10 + COMPRESS_AFTER_WEEKS) * WEEK },
    ])
  })

  it('finds several gaps, and the weeks inside one', () => {
    const n = 300
    const axis = timeAxisOf(
      ends(n),
      active(n, (i) => i < 5 || (i >= 80 && i < 90) || i >= 200),
    )
    expect(axis?.gaps).toHaveLength(2)
    expect(inGap(axis?.gaps ?? [], START + 40 * WEEK)).toBe(true)
    expect(inGap(axis?.gaps ?? [], START + 4 * WEEK)).toBe(false)
    // The two ends of a gap are the weeks either side of it, and are drawn.
    expect(inGap(axis?.gaps ?? [], START + 4 * WEEK)).toBe(false)
    expect(inGap(axis?.gaps ?? [], START + 80 * WEEK)).toBe(false)
  })
})
