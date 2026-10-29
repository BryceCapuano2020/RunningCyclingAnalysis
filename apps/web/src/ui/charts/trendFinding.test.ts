import { describe, expect, it } from 'vitest'
import { MIN_CHANGE_FRACTION, findingOf, phraseOf, withTail } from './trendFinding'
import type { PhraseTools, Reading } from './trendFinding'

const DAY = 86_400_000
/** The end of January 2019, UTC: the first of the months below. */
const START = Date.UTC(2019, 0, 31)

/** One reading a month from START, valued by `raw(month)`, with a range of `half` either side where given. */
function months(count: number, raw: (m: number) => number, half: number | null = null): Reading[] {
  return Array.from({ length: count }, (_, m) => ({
    endMs: START + m * 30 * DAY,
    raw: raw(m),
    low: half === null ? null : raw(m) - half,
    high: half === null ? null : raw(m) + half,
  }))
}

/** Rises for 36 months to a peak of 0.64 in early 2022, falls to 0.60 by 2024, then holds. */
const PEAK_THEN_DECLINE = (m: number) =>
  m <= 36 ? 0.5 + (0.14 * m) / 36 : m <= 60 ? 0.64 - (0.04 * (m - 36)) / 24 : 0.6

/** Monthly readings, one for each of `count` months, rising 0.01 a month. */
const monthsFrom = (count: number): Reading[] => months(count, (m) => 0.5 + m * 0.01)

describe('findingOf', () => {
  it('has nothing to say of fewer than two readings', () => {
    expect(findingOf([], 1)).toEqual({ recent: null, peak: null, highest: false })
    expect(
      findingOf(
        months(1, () => 0.6),
        1,
      ),
    ).toEqual({ recent: null, peak: null, highest: false })
  })

  it('judges a span of less than a year from its first reading, and says it is the whole span', () => {
    const finding = findingOf(
      months(8, (m) => 0.5 + m * 0.01),
      1,
    )
    expect(finding.recent).toMatchObject({ kind: 'better', namesStart: true })
    expect(finding.recent?.from.endMs).toBe(START)
    expect(finding.peak).toBeNull()
  })

  it('judges a longer span over its last year, from the reading nearest a year back', () => {
    const readings = months(80, PEAK_THEN_DECLINE)
    const finding = findingOf(readings, 1)
    const latest = readings.at(-1)!
    expect(finding.recent?.namesStart).toBe(false)
    expect(Math.abs(latest.endMs - finding.recent!.from.endMs - 364 * DAY)).toBeLessThanOrEqual(
      14 * DAY,
    )
  })

  it('finds a peak then a decline: steady over the last year, and clear under an older peak', () => {
    const finding = findingOf(months(80, PEAK_THEN_DECLINE), 1)
    expect(finding.recent?.kind).toBe('steady')
    expect(finding.peak?.best.raw).toBeCloseTo(0.64)
    expect(finding.peak?.latest.raw).toBeCloseTo(0.6)
    expect(new Date(finding.peak!.best.endMs).getUTCFullYear()).toBe(2022)
  })

  it('reports no peak while the best is inside the last year, which the move to now already tells', () => {
    expect(
      findingOf(
        months(80, (m) => 0.5 + m * 0.002),
        1,
      ).peak,
    ).toBeNull()
    // Best 6 months ago, latest slightly under it.
    const recentBest = months(80, (m) => (m === 74 ? 0.66 : 0.6))
    expect(findingOf(recentBest, 1).peak).toBeNull()
  })

  it('reports no peak when the latest is within the minimum of it', () => {
    const near = 0.64 * (1 - MIN_CHANGE_FRACTION * 0.5)
    expect(
      findingOf(
        months(80, (m) => (m === 30 ? 0.64 : near)),
        1,
      ).peak,
    ).toBeNull()
  })

  it('reports no peak for a range the best and the latest share, though the numbers differ by enough', () => {
    const wide = months(80, (m) => (m === 30 ? 0.66 : 0.6), 0.05)
    expect(findingOf(wide, 1).peak).toBeNull()
    const narrow = months(80, (m) => (m === 30 ? 0.66 : 0.6), 0.01)
    expect(findingOf(narrow, 1).peak).not.toBeNull()
  })

  it('has no move to now where the last year holds one reading, or readings too close to compare', () => {
    const sparse = [
      ...months(5, () => 0.6),
      { endMs: START + 3000 * DAY, raw: 0.62, low: null, high: null },
    ]
    expect(findingOf(sparse, 1).recent).toBeNull()
    const close = [
      ...months(5, () => 0.6),
      { endMs: START + 3000 * DAY, raw: 0.6, low: null, high: null },
      { endMs: START + 3030 * DAY, raw: 0.7, low: null, high: null },
    ]
    expect(findingOf(close, 1).recent).toBeNull()
  })

  it('reads a lower number as better where told, as a pace in seconds is', () => {
    const faster = months(8, (m) => 300 - m * 5)
    expect(findingOf(faster, -1).recent?.kind).toBe('better')
    expect(findingOf(faster, 1).recent?.kind).toBe('worse')
    const slowerNow = months(80, (m) => (m === 30 ? 240 : 270))
    expect(findingOf(slowerNow, -1).peak).not.toBeNull()
  })
})

describe('phraseOf', () => {
  const tools: PhraseTools = {
    words: {
      better: (a) => `rose ${a}`,
      worse: (a) => `fell ${a}`,
      peak: (a, year) => `is ${a} under its ${year} peak`,
      highest: 'is the highest on file',
      peakAfter: (a, year) => `${a} under its ${year} peak`,
      steady: 'has held steady',
    },
    amountOf: (from, to) => {
      const points = Math.round(Math.abs(to - from) * 100)
      return points === 0 ? null : `${points} points`
    },
    since: () => 'since May',
  }

  it('tells a peak and then a steady last year as two clauses, the second with no subject', () => {
    const phrase = phraseOf('Running', findingOf(months(80, PEAK_THEN_DECLINE), 1), tools)
    expect(withTail(phrase!.lead)).toBe('Running is 4 points under its 2022 peak')
    expect(phrase?.follow).toBe('steady over the last year')
  })

  it('leads with the move when there is one, and follows with the peak', () => {
    const falling = months(80, (m) => (m <= 30 ? 0.5 + m * 0.005 : 0.65 - (m - 30) * 0.004))
    const phrase = phraseOf('Running', findingOf(falling, 1), tools)
    expect(withTail(phrase!.lead)).toMatch(/^Running fell \d+ points over the last year$/)
    expect(phrase?.follow).toMatch(/^\d+ points under its 2021 peak$/)
  })

  it('is one clause with no peak, dated since the start on a span under a year', () => {
    const phrase = phraseOf(
      'Cycling',
      findingOf(
        months(8, (m) => 0.5 + m * 0.02),
        1,
      ),
      tools,
    )
    expect(withTail(phrase!.lead)).toBe('Cycling rose 14 points since May')
    expect(phrase?.follow).toBeNull()
  })

  it('calls a move that rounds to nothing steady, and has no phrase without a baseline', () => {
    const phrase = phraseOf(
      'Running',
      findingOf(
        months(8, () => 0.6),
        1,
      ),
      tools,
    )
    expect(withTail(phrase!.lead)).toBe('Running has held steady since May')
    expect(phraseOf('Running', findingOf([], 1), tools)).toBeNull()
  })
})

describe('findingOf across periods', () => {
  /** Three years of weekly readings: a rise to a high, then a fall that continues to the latest. */
  const weekly: Reading[] = Array.from({ length: 160 }, (_, i) => ({
    endMs: START + i * 7 * DAY,
    raw: i < 100 ? 0.5 + i * 0.002 : 0.7 - (i - 100) * 0.004,
    low: null,
    high: null,
  }))
  const latest = weekly.at(-1)!
  /** The series as a period shows it: only readings from `days` before the latest, as a trend line that starts a window in. */
  const view = (days: number) => weekly.filter((r) => latest.endMs - r.endMs <= days * DAY)

  it('uses the same reading for "the last year" in every period that says it', () => {
    const all = findingOf(weekly, 1).recent!
    const wide = findingOf(view(400), 1).recent!
    expect(all.namesStart).toBe(false)
    expect(wide.namesStart).toBe(false)
    expect(wide.from).toEqual(all.from)
    expect(wide.kind).toBe(all.kind)
  })

  it('names its start, and judges from the first plotted reading, where a period has none near a year back', () => {
    const shown = view(302)
    const recent = findingOf(shown, 1).recent!
    expect(recent.namesStart).toBe(true)
    expect(recent.from).toEqual(shown[0])
    // All time holds a reading a year back and says the year; the 302-day view must not borrow the wording.
    expect(findingOf(weekly, 1).recent!.namesStart).toBe(false)
    const tools: PhraseTools = {
      words: {
        better: (a) => `rose ${a}`,
        worse: (a) => `fell ${a}`,
        peak: (a) => a,
        highest: 'is the highest on file',
        peakAfter: (a) => a,
        steady: 'has held steady',
      },
      amountOf: (from, to) => `${Math.round(Math.abs(to - from) * 100)} points`,
      since: () => 'since 28 Dec',
    }
    expect(withTail(phraseOf('Running', findingOf(shown, 1), tools)!.lead)).toMatch(
      /^Running fell \d+ points since 28 Dec$/,
    )
    expect(withTail(phraseOf('Running', findingOf(weekly, 1), tools)!.lead)).toMatch(
      /^Running fell \d+ points over the last year$/,
    )
  })

  it('judges a year back that falls in a gap from the first reading in the last year, dated by its start', () => {
    const gap = weekly.filter(
      (r) => latest.endMs - r.endMs < 340 * DAY || latest.endMs - r.endMs > 400 * DAY,
    )
    const recent = findingOf(gap, 1).recent!
    expect(recent.namesStart).toBe(true)
    expect(latest.endMs - recent.from.endMs).toBeLessThanOrEqual(340 * DAY)
  })
})

describe('findingOf highest', () => {
  it('is true when the latest reading is the best of the series, and false when an earlier one beat it', () => {
    expect(
      findingOf(
        months(8, (m) => 0.5 + m * 0.02),
        1,
      ).highest,
    ).toBe(true)
    expect(
      findingOf(
        months(8, (m) => (m === 3 ? 0.7 : 0.5)),
        1,
      ).highest,
    ).toBe(false)
    expect(
      findingOf(
        months(8, (m) => 300 - m * 10),
        -1,
      ).highest,
    ).toBe(true)
    expect(
      findingOf(
        months(8, () => 0.6),
        1,
      ).highest,
    ).toBe(false)
  })
})

describe('findingOf evidence floor', () => {
  it('says nothing of fewer than six readings, however far apart they are', () => {
    expect(
      findingOf(
        months(5, (m) => 0.5 + m * 0.05),
        1,
      ),
    ).toEqual({
      recent: null,
      peak: null,
      highest: false,
    })
  })

  it('says nothing of a span under twelve weeks, however many readings it holds', () => {
    // Ten weekly readings span nine weeks.
    const weekly: Reading[] = Array.from({ length: 10 }, (_, i) => ({
      endMs: START + i * 7 * DAY,
      raw: 0.5 + i * 0.02,
      low: null,
      high: null,
    }))
    expect(findingOf(weekly, 1).recent).toBeNull()
    expect(findingOf(weekly, 1).highest).toBe(false)
    // Fourteen span thirteen weeks, and are judged.
    const longer = Array.from({ length: 14 }, (_, i) => ({
      ...weekly[0]!,
      endMs: START + i * 7 * DAY,
      raw: 0.5 + i * 0.02,
    }))
    expect(findingOf(longer, 1).recent?.kind).toBe('better')
  })

  it('says "over the last year" only where a reading lies within two weeks of 52 weeks back', () => {
    const reach = (months: number) => findingOf(monthsFrom(months), 1).recent
    // Seven months of readings reach back 180 days: named by their start.
    expect(reach(7)?.namesStart).toBe(true)
    // Twelve months reach back 330 days, and none lies near 364: still named by their start.
    expect(reach(12)?.namesStart).toBe(true)
    // Thirteen months reach back 360 days, within two weeks of 364: the last year, from that reading.
    expect(reach(13)?.namesStart).toBe(false)
    expect(reach(13)?.from.endMs).toBe(START)
  })

  it('names the real start of a baseline that is only some months into the last year', () => {
    // Years of readings, a break, then eight monthly ones in the last 210 days: the first of these is the baseline.
    const old = months(24, (m) => 0.5 + m * 0.002)
    const recent = Array.from({ length: 8 }, (_, i) => ({
      endMs: START + (1500 + i * 30) * DAY,
      raw: 0.6 + i * 0.01,
      low: null,
      high: null,
    }))
    const finding = findingOf([...old, ...recent], 1)
    expect(finding.recent?.namesStart).toBe(true)
    expect(finding.recent?.from.endMs).toBe(recent[0]!.endMs)
  })

  it('needs the latest to beat the best earlier reading by the minimum to be a high, for a recorded value too', () => {
    const base = months(8, (m) => (m === 3 ? 0.6 : 0.5))
    const nudge = (latest: number) =>
      Object.assign([...base], {
        [base.length - 1]: Object.assign({}, base.at(-1)!, { raw: latest }),
      })
    expect(findingOf(nudge(0.605), 1).highest).toBe(false)
    expect(findingOf(nudge(0.62), 1).highest).toBe(true)
  })
})

describe('findingOf highest for an estimate', () => {
  /** Readings with a range of `half` either side; the last is `latest`. */
  const ranged = (latest: number, half: number): Reading[] => [
    ...months(5, (m) => 0.4 + m * 0.01, half),
    { endMs: START + 3000 * DAY, raw: latest, low: latest - half, high: latest + half },
  ]

  it('is true only when the latest range sits clear above the previous best', () => {
    // The previous best is 0.44. A latest of 0.60 with a range of 0.05 has its low end at 0.55, clear above it.
    expect(findingOf(ranged(0.6, 0.05), 1).highest).toBe(true)
  })

  it('is false when the latest is higher but its range still reaches the previous best', () => {
    // 0.48 is above 0.44, but its low end, 0.43, is under it.
    expect(findingOf(ranged(0.48, 0.05), 1).highest).toBe(false)
    // The same latest as a value with no range is a high.
    const plain = ranged(0.48, 0.05).map((r) => Object.assign(r, { low: null, high: null }))
    expect(findingOf(plain, 1).highest).toBe(true)
  })

  it('reads the high end where a lower number is better', () => {
    const faster: Reading[] = [
      ...months(5, (m) => 300 - m, 3),
      { endMs: START + 3000 * DAY, raw: 280, low: 277, high: 283 },
    ]
    // The previous best is 296; the high end, 283, is under it.
    expect(findingOf(faster, -1).highest).toBe(true)
    expect(
      findingOf(
        faster.map((r, i) => (i === 5 ? Object.assign(r, { high: 297 }) : r)),
        -1,
      ).highest,
    ).toBe(false)
  })
})

describe('phraseOf when there is no year to compare', () => {
  const tools: PhraseTools = {
    words: {
      better: (a) => `rose ${a}`,
      worse: (a) => `fell ${a}`,
      highest: 'is the highest on file',
      peak: (a, year) => `is ${a} under its ${year} peak`,
      peakAfter: (a, year) => `${a} under its ${year} peak`,
      steady: 'has held steady',
    },
    amountOf: () => '1 point',
    since: () => 'since May',
  }
  /** A run of readings years back, then three in the last month: a break between them leaves no baseline. */
  const afterABreak = [
    ...months(6, (m) => 0.5 + m * 0.01),
    ...[0, 1, 2].map((i) => ({
      endMs: START + (2500 + i * 7) * DAY,
      raw: 0.7 + i * 0.05,
      low: null,
      high: null,
    })),
  ]

  it('says the latest is the highest on file when it is, which is a finding about now', () => {
    const finding = findingOf(afterABreak, 1)
    expect(finding.recent).toBeNull()
    expect(withTail(phraseOf('Cycling', finding, tools)!.lead)).toBe(
      'Cycling is the highest on file',
    )
  })

  it('tells the peak when the latest is clear under it, though there is no year to compare', () => {
    const readings = [
      ...months(6, (m) => (m === 2 ? 0.9 : 0.5)),
      { endMs: START + 2500 * DAY, raw: 0.7, low: null, high: null },
      { endMs: START + 2507 * DAY, raw: 0.71, low: null, high: null },
    ]
    const finding = findingOf(readings, 1)
    expect(finding.recent).toBeNull()
    expect(finding.highest).toBe(false)
    // The best is far above the latest, which is the finding.
    expect(phraseOf('Cycling', finding, tools)).not.toBeNull()
  })
})
