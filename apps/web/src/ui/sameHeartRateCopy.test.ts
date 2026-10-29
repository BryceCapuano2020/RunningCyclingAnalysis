// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate, SameHeartRateChange, SameHeartRateWeek } from '@rca/core/digest'
import {
  LACK_TEXT,
  TOO_FEW_WEEKS,
  sameHeartRateCopy,
  sameHeartRateTitle,
} from './sameHeartRateCopy'

const WEEK_MS = 7 * 86_400_000
// A Sunday in April: the window of the first week is mostly April, so the finding dates itself to it.
const FIRST_END = Date.UTC(2025, 3, 20, 23, 59, 59, 999)

function week(index: number, output: number | null, spread = 0.02): SameHeartRateWeek {
  return {
    endMs: FIRST_END + index * WEEK_MS,
    fit:
      output === null ? null : { output, low: output * (1 - spread), high: output * (1 + spread) },
    lacks: output === null ? 'blocks' : null,
    blocks: 12,
    activities: 7,
  }
}

/**
 * Weeks of the given outputs, with the change the first and last reporting weeks make unless `change` says
 * otherwise. The last of them is the period's last week unless `latestWeek` says.
 */
function data(
  outputs: (number | null)[],
  change: Partial<SameHeartRateChange> | null = {},
  { latestWeek = outputs.length - 1, spread = 0.02 } = {},
): SameHeartRate {
  const weeks = outputs.map((output, i) => week(i, output, spread))
  const reported = weeks.filter((w) => w.fit !== null)
  return {
    referenceHeartRate: 145,
    weeks,
    change:
      change === null
        ? null
        : {
            fromEndMs: reported[0]!.endMs,
            toEndMs: reported.at(-1)!.endMs,
            from: reported[0]!.fit!.output,
            to: reported.at(-1)!.fit!.output,
            weeksApart: reported.length - 1,
            relative: 0,
            real: true,
            ...change,
          },
    lacks: change === null ? 'weeks' : null,
    latestWeekEndMs: FIRST_END + latestWeek * WEEK_MS,
  }
}

/** `n` weeks of a run whose pace goes in a straight line from `fromS` to `toS` seconds a kilometre, as speeds. */
function pace(fromS: number, toS: number, n = 8): number[] {
  return Array.from({ length: n }, (_, i) => 1000 / (fromS + ((toS - fromS) * i) / (n - 1)))
}

/** `n` weeks of a ride whose output goes in a straight line from `from` to `to` watts. */
function watts(from: number, to: number, n = 8): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))
}

describe('the title', () => {
  it('names the reference heart rate', () => {
    expect(sameHeartRateTitle('run', 145, 'metric')).toBe(
      'Your output at 145 bpm, flat pace per kilometre',
    )
    expect(sameHeartRateTitle('ride', 150, 'metric')).toBe('Your output at 150 bpm, power in watts')
  })
})

describe('the sentence', () => {
  beforeEach(() => {
    // formatDay leaves out the year in the current year, so the clock is pinned to another year.
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 10))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says a real change in a run as seconds faster than the month the first week is in, from the fitted line', () => {
    // 370 to 333 s/km across the weeks: 37 s/km.
    const copy = sameHeartRateCopy('run', data(pace(370, 333)), 'metric')
    expect(copy).toEqual({
      kind: 'change',
      text: 'At the same heart rate you run 37 s/km faster than in April',
    })
  })

  it('counts a run’s change in seconds a mile in miles, from the same weeks', () => {
    // 595.5 to 535.9 s/mi: 60.
    const copy = sameHeartRateCopy('run', data(pace(370, 333)), 'imperial')
    expect(copy.text).toBe('At the same heart rate you run 60 s/mi faster than in April')
  })

  it('says a real change in a ride in watts', () => {
    const copy = sameHeartRateCopy('ride', data(watts(198, 214)), 'metric')
    expect(copy.text).toBe('At the same heart rate you put out 16 W more than in April')
  })

  it('quotes the line, not the two end weeks: a noisy last week does not move the amount', () => {
    // A straight 198 to 214 across the weeks, except that the last week reads 230.
    const outputs = [...watts(198, 214, 8).slice(0, 7), 230]
    const copy = sameHeartRateCopy('ride', data(outputs), 'metric')
    // The two end weeks differ by 32 W; the fitted line moves by less.
    expect(copy.text).toMatch(/you put out (1\d|2[0-5]) W more/)
    expect(copy.text).not.toContain('32 W')
  })

  it('names the week rather than saying it as now when the change ends before the period’s last week', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data(watts(198, 214), { toEndMs: FIRST_END + 5 * WEEK_MS, weeksApart: 5 }, { latestWeek: 7 }),
      'metric',
    )
    expect(copy.text).toBe(
      'At the same heart rate, by the week ending Sun 25 May 2025, you put out 16 W more than in April',
    )
  })

  it('says a fall as plainly as a rise', () => {
    expect(sameHeartRateCopy('ride', data(watts(214, 198)), 'metric').text).toBe(
      'At the same heart rate you put out 16 W less than in April',
    )
    expect(sameHeartRateCopy('run', data(pace(333, 370)), 'metric').text).toBe(
      'At the same heart rate you run 37 s/km slower than in April',
    )
  })

  it('never says a change smaller than a unit as nothing', () => {
    // Intervals of a thousandth of the output, so even 0.4 W across the weeks is a clear trend.
    const copy = sameHeartRateCopy(
      'ride',
      data(watts(200, 200.4), {}, { spread: 0.0005 }),
      'metric',
    )
    expect(copy.text).toContain('1 W more')
  })

  it('says no clear change when the end weeks differ but the line is not clear of flat', () => {
    // The end weeks differ (200 and 214), but the weeks between wander about a flat line.
    const copy = sameHeartRateCopy('ride', data([200, 211, 196, 209, 197, 210, 199, 214]), 'metric')
    expect(copy).toEqual({
      kind: 'held',
      text: 'At the same heart rate: no clear change since April',
    })
  })

  it('names a change from the line when it is clear of flat, whatever the digest’s end-week test says', () => {
    // One test only: the end weeks' ranges overlapping does not hold back a trend the band excludes flat from.
    const copy = sameHeartRateCopy('ride', data(watts(198, 214), { real: false }), 'metric')
    expect(copy.kind).toBe('change')
  })

  it('says no clear change when the line is not clear of flat, even where the end weeks’ ranges do not overlap', () => {
    const copy = sameHeartRateCopy('ride', data(watts(204, 207), { real: true }), 'metric')
    expect(copy.kind).toBe('held')
  })

  it('says no clear change, and since when, when the line is flat to within its band', () => {
    const copy = sameHeartRateCopy('ride', data(watts(204, 207)), 'metric')
    expect(copy).toEqual({
      kind: 'held',
      text: 'At the same heart rate: no clear change since April',
    })
  })

  it('adds the year to the month when the first week is in the same month as the last', () => {
    // Four weekly windows, the middles of which are all in April.
    const copy = sameHeartRateCopy(
      'ride',
      data(watts(198, 214, 4), {}, { spread: 0.0005 }),
      'metric',
    )
    expect(copy.text).toMatch(/than in April 2025$/)
  })

  it('adds the year to the month when the first week is nine or more months back', () => {
    const forty = sameHeartRateCopy(
      'ride',
      data(watts(198, 214, 40), {}, { spread: 0.0005 }),
      'metric',
    )
    expect(forty.text).toMatch(/than in April 2025$/)
    // Eight months back: the bare month is clear.
    const thirty = sameHeartRateCopy(
      'ride',
      data(watts(198, 214, 34), {}, { spread: 0.0005 }),
      'metric',
    )
    expect(thirty.text).toMatch(/than in April$/)
  })

  it('says there are too few weeks, rather than no change, with fewer than four reporting', () => {
    const copy = sameHeartRateCopy('ride', data([204, null, 206, 207]), 'metric')
    expect(copy).toEqual({ kind: 'missing', text: TOO_FEW_WEEKS })
    expect(SAME_HEART_RATE.minReportedWeeks).toBe(4)
  })

  it('still names a clear change from fewer than four weeks, when the line is clear of flat', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data(watts(198, 214, 3), {}, { spread: 0.0005 }),
      'metric',
    )
    expect(copy.kind).toBe('change')
  })

  it('names what is missing, in a muted line, when there is no change to give', () => {
    const copy = sameHeartRateCopy(
      'run',
      { ...data([null, null], null), lacks: 'activities' },
      'metric',
    )
    expect(copy.kind).toBe('missing')
    expect(copy.text).toBe(LACK_TEXT.activities('run'))
  })

  it('says nothing is on file without a reference heart rate', () => {
    const none: SameHeartRate = {
      referenceHeartRate: null,
      weeks: [],
      change: null,
      lacks: 'blocks',
      latestWeekEndMs: null,
    }
    expect(sameHeartRateCopy('ride', none, 'metric').text).toBe(LACK_TEXT.blocks('ride'))
  })

  it('says a short period in plain words', () => {
    expect(LACK_TEXT.period('run')).toBe(
      'Needs 4 weeks of steady efforts with heart rate. Pick a longer period to see it.',
    )
  })

  it('never calls it fitness, or a strength or a limit', () => {
    const words = /fitness|limiter|weak|strength|holding you back|ahead of/i
    const lacks: Lack[] = ['blocks', 'activities', 'weeks', 'spread', 'range', 'period']
    for (const lack of lacks) {
      for (const sport of ['run', 'ride'] as const) {
        expect(LACK_TEXT[lack](sport)).not.toMatch(words)
      }
    }
    expect(TOO_FEW_WEEKS).not.toMatch(words)
  })

  it('states the thresholds from the constants', () => {
    expect(LACK_TEXT.blocks('run')).toContain(String(SAME_HEART_RATE.minBlocks))
    expect(LACK_TEXT.activities('ride')).toContain(`${SAME_HEART_RATE.minActivities} rides`)
    expect(LACK_TEXT.spread('run')).toContain(String(SAME_HEART_RATE.minSpreadBpm))
  })
})
