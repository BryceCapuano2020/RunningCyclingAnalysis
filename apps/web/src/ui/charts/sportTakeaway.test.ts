import { describe, expect, it } from 'vitest'
import { sportTakeaway } from './sportTakeaway'

const DAY = 86_400_000
const WEEK = 7 * DAY
/** Sunday 4 May 2025, the end of a week, UTC. */
const MAY = Date.UTC(2025, 4, 5) - 1
/** The end of January 2019, UTC. */
const JAN_2019 = Date.UTC(2019, 0, 31)

/** `count` weekly rows of speeds in m/s or watts, from `from`. */
const weekly = (count: number, value: (i: number) => number | null, from = MAY) =>
  Array.from({ length: count }, (_, i) => ({ endMs: from + i * WEEK, value: value(i) }))

/** Rises to a peak of 4.4 m/s after a year, falls to 4.2 m/s by the end of the second, then holds. */
const RUN_PEAK = (i: number) =>
  i <= 52 ? 4 + (0.4 * i) / 52 : i <= 104 ? 4.4 - (0.2 * (i - 52)) / 52 : 4.2
/** The same in watts: 250 to 300 W, down to 280 W. */
const RIDE_PEAK = (i: number) =>
  i <= 52 ? 250 + (50 * i) / 52 : i <= 104 ? 300 - (20 * (i - 52)) / 52 : 280

describe('sportTakeaway for running, over a span under a year', () => {
  it('says how much faster the pace got, in seconds per kilometre, since the first week', () => {
    expect(
      sportTakeaway(
        weekly(14, (i) => 4 + i * 0.03),
        'run',
        'metric',
        '20 min',
      ),
    ).toMatch(/^Your best 20 min pace is \d+ s per kilometre faster since 4 May$/)
  })

  it('says slower for a slower pace, in miles for imperial', () => {
    expect(
      sportTakeaway(
        weekly(14, (i) => 4.2 - i * 0.02),
        'run',
        'imperial',
        '20 min',
      ),
    ).toMatch(/^Your best 20 min pace is \d+ s per mile slower since 4 May$/)
  })

  it('calls a change of a few seconds steady, since a week’s best moves that much on its own', () => {
    expect(
      sportTakeaway(
        weekly(14, (i) => 4 + i * 0.003),
        'run',
        'metric',
        '20 min',
      ),
    ).toBe('Your best 20 min pace has held steady since 4 May')
  })

  it('says nothing of a span under twelve weeks, nor of fewer than six values', () => {
    // The three-point claims a short test series once made are not made: three weeks cannot tell a change from noise.
    expect(
      sportTakeaway(
        weekly(3, (i) => 4 + i * 0.1),
        'run',
        'metric',
        '20 min',
      ),
    ).toBeNull()
    expect(
      sportTakeaway(
        weekly(11, (i) => 4 + i * 0.05),
        'run',
        'metric',
        '20 min',
      ),
    ).toBeNull()
    expect(
      sportTakeaway(
        weekly(14, (i) => (i % 3 === 0 ? 4 + i * 0.05 : null)),
        'run',
        'metric',
        '5 min',
      ),
    ).toBeNull()
  })

  it('skips weeks with none, and dates the claim from the first week that has a value', () => {
    expect(
      sportTakeaway(
        weekly(16, (i) => (i < 2 ? null : 4 + i * 0.03)),
        'run',
        'metric',
        '5 min',
      ),
    ).toMatch(/^Your best 5 min pace is \d+ s per kilometre faster since 18 May$/)
  })
})

describe('sportTakeaway for cycling, over a span under a year', () => {
  it('says power rose or fell in watts', () => {
    expect(
      sportTakeaway(
        weekly(14, (i) => 250 + i * 3),
        'ride',
        'metric',
        '20 min',
      ),
    ).toBe('Your best 20 min power rose 39 W since 4 May')
    expect(
      sportTakeaway(
        weekly(14, (i) => 290 - i * 3),
        'ride',
        'metric',
        '60 min',
      ),
    ).toBe('Your best 60 min power fell 39 W since 4 May')
  })

  it('calls a change under three per cent steady', () => {
    expect(
      sportTakeaway(
        weekly(14, (i) => 250 + i * 0.5),
        'ride',
        'metric',
        '20 min',
      ),
    ).toBe('Your best 20 min power has held steady since 4 May')
  })
})

describe('sportTakeaway after a peak', () => {
  const long = (value: (i: number) => number | null) => weekly(160, value, JAN_2019)

  it('says a run is slower than its best of an older year, and steady over the last year', () => {
    expect(sportTakeaway(long(RUN_PEAK), 'run', 'metric', '20 min')).toMatch(
      /^Your best 20 min pace is \d+ s per kilometre slower than its 2020 best; steady over the last year$/,
    )
  })

  it('says a ride is under its peak, and steady over the last year', () => {
    expect(sportTakeaway(long(RIDE_PEAK), 'ride', 'metric', '20 min')).toBe(
      'Your best 20 min power is 20 W under its 2020 peak; steady over the last year',
    )
  })

  it('says the move over the last year first when the last year moved, then the peak', () => {
    const falling = long((i) => (i <= 60 ? 250 + i : 310 - (i - 60) * 0.7))
    expect(sportTakeaway(falling, 'ride', 'metric', '20 min')).toMatch(
      /^Your best 20 min power fell \d+ W over the last year; \d+ W under its 2020 peak$/,
    )
  })

  it('says a rise over the last year plainly, with no peak, when the best is recent', () => {
    expect(
      sportTakeaway(
        long((i) => 250 + i * 0.4),
        'ride',
        'metric',
        '20 min',
      ),
    ).toMatch(/^Your best 20 min power rose \d+ W over the last year$/)
  })

  it('compares weeks with weeks: a week’s high is not lost in a month’s mean', () => {
    // 280 W for years, one week of 300 W, and the latest week 285 W: the latest is not the best on file.
    const title = sportTakeaway(
      long((i) => (i === 100 ? 300 : i === 159 ? 285 : 280)),
      'ride',
      'metric',
      '20 min',
    )
    expect(title).not.toMatch(/highest/)
  })

  it('has at most two clauses', () => {
    for (const title of [
      sportTakeaway(long(RUN_PEAK), 'run', 'metric', '20 min'),
      sportTakeaway(long(RIDE_PEAK), 'ride', 'metric', '20 min'),
    ]) {
      expect(title?.split(';').length).toBeLessThanOrEqual(2)
    }
  })
})

describe('sportTakeaway with no year to compare', () => {
  /** Twenty weekly readings in 2019, then a break, then ten in late 2026, the last at `latest`. */
  const afterABreak = (latest: number) => [
    ...weekly(20, (i) => 200 + i, JAN_2019),
    ...weekly(10, (i) => (i === 9 ? latest : 215), Date.UTC(2026, 6, 5) - 1),
  ]

  it('says the latest is the highest on file when it is clear of the best before it', () => {
    expect(sportTakeaway(afterABreak(250), 'ride', 'metric', '20 min')).toBe(
      'Your best 20 min power is the highest on file',
    )
  })

  it('says a pace is the fastest on file', () => {
    const faster = [
      ...weekly(20, (i) => 3.5 + i * 0.01, JAN_2019),
      ...weekly(10, (i) => (i === 9 ? 4.2 : 3.8), Date.UTC(2026, 6, 5) - 1),
    ]
    expect(sportTakeaway(faster, 'run', 'metric', '20 min')).toBe(
      'Your best 20 min pace is the fastest on file',
    )
  })

  it('says nothing when the latest is not clear of the best before it, with no year to compare', () => {
    // The best before is 219 W; 222 W is under 3% more.
    expect(sportTakeaway(afterABreak(222), 'ride', 'metric', '20 min')).toBeNull()
  })
})
