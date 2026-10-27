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
const FIRST_END = Date.UTC(2025, 2, 2, 23, 59, 59, 999)

function week(index: number, output: number | null): SameHeartRateWeek {
  return {
    endMs: FIRST_END + index * WEEK_MS,
    fit: output === null ? null : { output, low: output * 0.98, high: output * 1.02 },
    lacks: output === null ? 'blocks' : null,
    blocks: 12,
    activities: 7,
  }
}

/** Weeks of the given outputs; the last of them is the period's last week unless `latestWeek` says. */
function data(
  change: Partial<SameHeartRateChange> | null,
  outputs: (number | null)[],
  latestWeek = outputs.length - 1,
): SameHeartRate {
  const weeks = outputs.map((output, i) => week(i, output))
  return {
    referenceHeartRate: 145,
    weeks,
    change:
      change === null
        ? null
        : {
            fromEndMs: weeks[0]!.endMs,
            toEndMs: weeks.at(-1)!.endMs,
            from: 3,
            to: 3,
            weeksApart: 8,
            relative: 0,
            real: false,
            ...change,
          },
    lacks: change === null ? 'weeks' : null,
    latestWeekEndMs: FIRST_END + latestWeek * WEEK_MS,
  }
}

const EIGHT = [3, 3, 3, 3, 3, 3, 3, 3]

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

  it('says a real change in a run as the pace now against the pace before, when it reaches the last week', () => {
    // 3.0 m/s is 5:33/km and 2.7 m/s is 6:10/km.
    const copy = sameHeartRateCopy('run', data({ from: 2.7, to: 3.0, real: true }, EIGHT), 'metric')
    expect(copy).toEqual({
      kind: 'change',
      text: 'At 145 bpm you now run 5:33 /km, against 6:10 /km 8 weeks ago.',
    })
  })

  it('says a real change in a ride in watts', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 198, to: 214, real: true }, EIGHT),
      'metric',
    )
    expect(copy.text).toBe('At 145 bpm you now ride 214 W, against 198 W 8 weeks ago.')
  })

  it('names the week rather than saying now when the change ends before the period’s last week', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data(
        { from: 198, to: 214, real: true, toEndMs: FIRST_END + 5 * WEEK_MS, weeksApart: 5 },
        EIGHT,
        7,
      ),
      'metric',
    )
    expect(copy.text).toBe(
      'At 145 bpm in the week ending Sun 6 Apr 2025 you rode 214 W, against 198 W 5 weeks earlier.',
    )
  })

  it('says a fall as plainly as a rise', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 214, to: 198, real: true }, EIGHT),
      'metric',
    )
    expect(copy.text).toBe('At 145 bpm you now ride 198 W, against 214 W 8 weeks ago.')
  })

  it('says one week ago in the singular', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 198, to: 214, real: true, weeksApart: 1 }, [198, 214, 214, 214]),
      'metric',
    )
    expect(copy.text).toContain('1 week ago')
  })

  it('quotes the first and last values, and says no clear change, when the ranges overlap', () => {
    const copy = sameHeartRateCopy('ride', data({ from: 204, to: 207 }, EIGHT), 'metric')
    expect(copy).toEqual({
      kind: 'held',
      text: 'At 145 bpm your power went from 204 to 207 W: no clear change, within the error.',
    })
  })

  it('writes a pace range with its unit once', () => {
    const copy = sameHeartRateCopy('run', data({ from: 3.0, to: 2.9 }, EIGHT), 'metric')
    expect(copy.text).toBe(
      'At 145 bpm your pace went from 5:33 to 5:45 /km: no clear change, within the error.',
    )
  })

  it('says there are too few weeks, rather than no change, with fewer than four reporting', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 204, to: 207 }, [204, null, 206, 207]),
      'metric',
    )
    expect(copy).toEqual({ kind: 'missing', text: TOO_FEW_WEEKS })
    expect(SAME_HEART_RATE.minReportedWeeks).toBe(4)
  })

  it('still names a real change from fewer than four weeks', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 198, to: 214, real: true, weeksApart: 2 }, [198, 205, 214]),
      'metric',
    )
    expect(copy.kind).toBe('change')
  })

  it('names what is missing, in a muted line, when there is no change to give', () => {
    const copy = sameHeartRateCopy(
      'run',
      { ...data(null, [null, null]), lacks: 'activities' },
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
