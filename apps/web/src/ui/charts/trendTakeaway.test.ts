import { describe, expect, it } from 'vitest'
import { MIN_CHANGE_FRACTION, trendTakeaway } from './trendTakeaway'

const DAY = 86_400_000
const WEEK = 7 * DAY
/** Sunday 4 May 2025, the end of a week, UTC. */
const MAY = Date.UTC(2025, 4, 5) - 1
/** The end of January 2019, UTC: the first of the weeks of a long series. */
const JAN_2019 = Date.UTC(2019, 0, 31)

interface Row {
  endMs: number
  run: number | null
  ride: number | null
  rideLow: number | null
  rideHigh: number | null
}

/** `count` weekly rows from `from`, a run and a ride value for each week; the ride's range is `half` each side. */
function weekly(
  count: number,
  run: (i: number) => number | null,
  ride: (i: number) => number | null = () => null,
  half = 0.01,
  from = MAY,
): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const r = ride(i)
    return {
      endMs: from + i * WEEK,
      run: run(i),
      ride: r,
      rideLow: r === null ? null : r - half,
      rideHigh: r === null ? null : r + half,
    }
  })
}

const rideKnown = { rideKnown: true }

/** Rises to 0.64 after a year, falls to 0.60 by the end of the second, then holds. */
const PEAK_THEN_DECLINE = (i: number) =>
  i <= 52 ? 0.5 + (0.14 * i) / 52 : i <= 104 ? 0.64 - (0.04 * (i - 52)) / 52 : 0.6

describe('trendTakeaway on a span of under a year', () => {
  it('says what held steady and what rose, since the start', () => {
    const series = weekly(
      14,
      () => 0.6,
      (i) => 0.46 + i * 0.008,
    )
    expect(trendTakeaway(series, rideKnown)).toBe(
      'Running has held steady; cycling rose 10 points since 4 May',
    )
  })

  it('says both held steady in one clause', () => {
    const series = weekly(
      14,
      () => 0.6,
      () => 0.5,
      0.03,
    )
    expect(trendTakeaway(series, rideKnown)).toBe(
      'Running and cycling have held steady since 4 May',
    )
  })

  it('says a fall, and each sport from its own start when they differ', () => {
    const series = weekly(
      16,
      (i) => 0.7 - i * 0.01,
      (i) => (i < 2 ? null : 0.5 - (i - 2) * 0.01),
    )
    expect(trendTakeaway(series, rideKnown)).toMatch(
      /^Running fell \d+ points since 4 May; cycling fell \d+ points since 18 May$/,
    )
  })

  it('counts a change only past the minimum, and a ride only clear of its range', () => {
    const under = 0.6 * (1 + MIN_CHANGE_FRACTION * 0.9)
    expect(
      trendTakeaway(
        weekly(14, (i) => (i === 13 ? under : 0.6)),
        rideKnown,
      ),
    ).toBe('Running has held steady since 4 May')
    // A 5 point rise is a change for a run (no range) and not for a ride whose range of 3 points covers it.
    const series = weekly(
      14,
      (i) => 0.6 + i * 0.004,
      (i) => 0.5 + i * 0.004,
      0.03,
    )
    expect(trendTakeaway(series, rideKnown)).toBe(
      'Running rose 5 points; cycling has held steady since 4 May',
    )
  })

  it('says nothing of a span under twelve weeks or of fewer than six readings', () => {
    expect(
      trendTakeaway(
        weekly(11, (i) => 0.5 + i * 0.01),
        rideKnown,
      ),
    ).toBeNull()
    const sparse = weekly(14, (i) => (i % 3 === 0 ? 0.5 + i * 0.01 : null))
    expect(trendTakeaway(sparse, rideKnown)).toBeNull()
  })

  it('leaves a held ride out, and has no title when no sport has a baseline', () => {
    const series = weekly(
      14,
      (i) => 0.5 + i * 0.01,
      (i) => 0.5 + i * 0.02,
    )
    expect(trendTakeaway(series, { rideKnown: false })).toBe('Running rose 13 points since 4 May')
    expect(trendTakeaway([], rideKnown)).toBeNull()
  })
})

describe('trendTakeaway on weeks, not months', () => {
  it('compares the latest week with weeks, so a month’s average cannot hide or fake a high', () => {
    // Weekly values: 0.60 for 70 weeks, then one week of 0.62 and the latest 0.61. The latest week is not the highest
    // on file (0.62 is higher), though it is above every monthly mean of the series.
    const series = weekly(
      80,
      (i) => (i === 74 ? 0.62 : i === 79 ? 0.61 : 0.6),
      () => null,
      0.01,
      JAN_2019,
    )
    expect(trendTakeaway(series, rideKnown)).not.toMatch(/highest/)
  })
})

describe('trendTakeaway after a peak', () => {
  const long = (
    run: (i: number) => number | null,
    ride: (i: number) => number | null = () => null,
    half = 0.01,
  ) => weekly(160, run, ride, half, JAN_2019)

  it('says where now stands under an older peak, and that the last year was steady', () => {
    expect(trendTakeaway(long(PEAK_THEN_DECLINE), rideKnown)).toBe(
      'Running is 4 points under its 2020 peak; steady over the last year',
    )
  })

  it('does not tell the whole span, which rose, when the present is a decline from a peak', () => {
    const title = trendTakeaway(long(PEAK_THEN_DECLINE), rideKnown)
    expect(title).not.toMatch(/rose/)
    expect(title).not.toMatch(/since/)
  })

  it('says the move over the last year, and then the peak, when the last year fell', () => {
    const falling = long((i) => (i <= 60 ? 0.5 + i * 0.0025 : 0.65 - (i - 60) * 0.002))
    expect(trendTakeaway(falling, rideKnown)).toMatch(
      /^Running fell \d+ points over the last year; \d+ points under its 2020 peak$/,
    )
  })

  it('says a rise over the last year plainly, with no peak, however the earlier years went', () => {
    const recovering = long((i) => (i < 100 ? 0.6 : 0.6 + (i - 100) * 0.002))
    expect(trendTakeaway(recovering, rideKnown)).toMatch(
      /^Running rose \d+ points over the last year$/,
    )
  })

  it('keeps two sports to one clause each: the peak for one, the move for the other', () => {
    const title = trendTakeaway(
      long(PEAK_THEN_DECLINE, (i) => (i < 90 ? null : 0.4 + (i - 90) * 0.005), 0.01),
      rideKnown,
    )
    expect(title).toMatch(
      /^Running is 4 points under its 2020 peak; cycling rose \d+ points over the last year$/,
    )
    expect(title?.split(';')).toHaveLength(2)
  })

  it('says both steady over the last year in one clause', () => {
    const title = trendTakeaway(
      long(
        () => 0.6,
        () => 0.5,
        0.03,
      ),
      rideKnown,
    )
    expect(title).toBe('Running and cycling have held steady over the last year')
  })

  it('names the real span, not the last year, where the baseline is only a few months back', () => {
    // Years of readings, a break, then twenty weekly ones in the last 140 days, rising.
    const early = weekly(
      60,
      (i) => 0.5 + i * 0.001,
      () => null,
      0.01,
      JAN_2019,
    )
    const recent = weekly(
      20,
      (i) => 0.62 + i * 0.01,
      () => null,
      0.01,
      JAN_2019 + 300 * WEEK,
    )
    const title = trendTakeaway([...early, ...recent], rideKnown)
    expect(title).toMatch(/^Running rose \d+ points since \d+ [A-Z][a-z]{2}$/)
    expect(title).not.toMatch(/last year/)
  })

  it('has at most two clauses, whatever the series', () => {
    for (const rows of [
      long(PEAK_THEN_DECLINE),
      long(PEAK_THEN_DECLINE, PEAK_THEN_DECLINE, 0.005),
      long(
        (i) => 0.5 + i * 0.001,
        (i) => 0.7 - i * 0.001,
        0.005,
      ),
    ]) {
      expect(trendTakeaway(rows, rideKnown)?.split(';').length).toBeLessThanOrEqual(2)
    }
  })
})

describe('trendTakeaway for an estimated ride that is back after a break', () => {
  /** Twenty weekly rides in 2019, then ten in late 2026 at 0.45, and the latest at `latest`, with `half` each side. */
  const afterABreak = (latest: number, half: number): Row[] => [
    ...weekly(
      20,
      () => null,
      (i) => 0.4 + i * 0.002,
      half,
      JAN_2019,
    ),
    ...weekly(
      10,
      () => null,
      (i) => (i === 9 ? latest : 0.45),
      half,
      Date.UTC(2026, 6, 5) - 1,
    ),
  ]

  it('says it is the highest on file only when its range sits clear above the previous best', () => {
    expect(trendTakeaway(afterABreak(0.6, 0.03), rideKnown)).toBe('Cycling is the highest on file')
  })

  it('says nothing about a high where the range still reaches the previous best', () => {
    // 0.5 is higher than 0.45, but its range of 8 points reaches down to 0.42.
    expect(trendTakeaway(afterABreak(0.5, 0.08), rideKnown)).toBeNull()
  })
})

describe('trendTakeaway across periods', () => {
  /** Three years of weekly runs, rising for two years and falling after. */
  const all = weekly(
    160,
    (i) => (i < 104 ? 0.5 + i * 0.002 : 0.708 - (i - 104) * 0.004),
    undefined,
    0.01,
    JAN_2019,
  )
  const latest = all.at(-1)!.endMs
  /** What a 12-months view plots: its trend line starts about 302 days before the latest reading. */
  const twelveMonths = all.filter((row) => latest - row.endMs <= 302 * DAY)

  it('says "over the last year" only where a reading lies a year back, and names a start otherwise', () => {
    const wide = trendTakeaway(all, rideKnown)
    const short = trendTakeaway(twelveMonths, rideKnown)
    expect(wide).toMatch(/^Running fell \d+ points? over the last year/)
    expect(short).toMatch(/^Running fell \d+ points? since \d+ \w{3}$/)
    expect(short).not.toContain('last year')
  })

  it('gives both periods the same verdict where both compare against a year back', () => {
    const wide = trendTakeaway(all, rideKnown)
    const nearYear = trendTakeaway(
      all.filter((row) => latest - row.endMs <= 400 * DAY),
      rideKnown,
    )
    expect(nearYear).toBe(wide)
  })
})
