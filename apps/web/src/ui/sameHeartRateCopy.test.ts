// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import {
  LACK_TEXT,
  sameHeartRateLackText,
  sameHeartRateName,
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

/** Weeks of the given outputs, or none to draw (`drawn` false) with the lack named; the last is the period's last week. */
function data(outputs: (number | null)[], drawn = true, spread = 0.02): SameHeartRate {
  const weeks = outputs.map((output, i) => week(i, output, spread))
  const reportedWeeks = weeks.filter((w) => w.fit !== null).length
  return {
    referenceHeartRate: 145,
    weeks,
    reportedWeeks,
    lacks: drawn ? null : 'weeks',
    latestWeekEndMs: FIRST_END + (outputs.length - 1) * WEEK_MS,
  }
}

describe('the names', () => {
  it('names the section by the sport’s own measure, and the chart by the heart rate it reads at', () => {
    expect(sameHeartRateName('run')).toBe('Pace at heart rate')
    expect(sameHeartRateName('ride')).toBe('Power at heart rate')
    expect(sameHeartRateTitle('run', 145)).toBe('Pace at 145 bpm, by week')
    expect(sameHeartRateTitle('ride', 150)).toBe('Power at 150 bpm, by week')
  })

  it('names no heart rate rather than a wrong one when there is none', () => {
    expect(sameHeartRateTitle('run', null)).toBe('Pace at one heart rate, by week')
  })
})

describe('the weekly view’s words', () => {
  it('names no change for any data: the fitness status is the sport’s voice on that', () => {
    const rising = data([198, 200, 203, 207, 210, 212, 214, 216])
    expect(sameHeartRateLackText('ride', rising)).toBeNull()
    expect(sameHeartRateTitle('ride', 145)).not.toMatch(/more|less|faster|slower|change/i)
  })

  it('says what the library has, with its counts, when there is nothing to draw', () => {
    const few = data([null, null], false)
    // The week that came closest to reporting is the one with the most stretches, the latest of equals.
    const weeks = [
      { ...few.weeks[0]!, lacks: 'activities' as const, blocks: 7, activities: 3 },
      {
        ...few.weeks[1]!,
        lacks: 'activities' as const,
        blocks: 7,
        activities: 4,
        wide: true as const,
      },
    ]
    expect(sameHeartRateLackText('run', { ...few, weeks, lacks: 'activities' })).toBe(
      '4 of 6 runs with steady stretches in 8 weeks.',
    )
    expect(sameHeartRateLackText('ride', { ...few, weeks: [weeks[0]!], lacks: 'activities' })).toBe(
      '3 of 6 rides with steady stretches in 4 weeks.',
    )
    expect(
      sameHeartRateLackText('run', {
        ...few,
        weeks: [{ ...weeks[0]!, lacks: 'blocks', blocks: 5 }],
        lacks: 'blocks',
      }),
    ).toBe('5 of 8 steady 5-minute stretches with heart rate in 4 weeks.')
  })

  it('says what a lack needs where it is not a count', () => {
    expect(sameHeartRateLackText('run', { ...data([null, null], false), lacks: 'weeks' })).toBe(
      LACK_TEXT.weeks('run'),
    )
  })

  it('never opens with needs where it has a count to give', () => {
    const counted = sameHeartRateLackText('ride', {
      ...data([null, null], false),
      weeks: [{ ...week(0, null), lacks: 'activities', blocks: 9, activities: 2 }],
      lacks: 'activities',
    })
    expect(counted).not.toMatch(/needs/i)
  })

  it('draws weeks that report even when too few to name a trend: there is no lack', () => {
    expect(sameHeartRateLackText('ride', data([204, null, 206, 207]))).toBeNull()
  })

  it('says nothing is on file without a reference heart rate', () => {
    const none: SameHeartRate = {
      referenceHeartRate: null,
      weeks: [],
      reportedWeeks: 0,
      lacks: 'blocks',
      latestWeekEndMs: null,
    }
    expect(sameHeartRateLackText('ride', none)).toBe(
      '0 of 8 steady 5-minute stretches with heart rate in 8 weeks.',
    )
  })

  it('says a short period in plain words', () => {
    expect(LACK_TEXT.period('run')).toBe('Needs 4 weeks of steady efforts with heart rate.')
  })

  it('never calls it fitness, or a strength or a limit', () => {
    const words = /fitness|limiter|weak|strength|holding you back|ahead of/i
    const lacks: Lack[] = ['blocks', 'activities', 'weeks', 'spread', 'range', 'period']
    for (const lack of lacks) {
      for (const sport of ['run', 'ride'] as const) {
        expect(LACK_TEXT[lack](sport)).not.toMatch(words)
      }
    }
  })

  it('states the thresholds from the constants', () => {
    expect(LACK_TEXT.blocks('run')).toContain(String(SAME_HEART_RATE.minBlocks))
    expect(LACK_TEXT.activities('ride')).toContain(`${SAME_HEART_RATE.minActivities} rides`)
    expect(LACK_TEXT.spread('run')).toContain(String(SAME_HEART_RATE.minSpreadBpm))
  })
})
