// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import { LACK_TEXT, sameHeartRateLackText, sameHeartRateTitle } from './sameHeartRateCopy'

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

describe('the title', () => {
  it('names the reference heart rate', () => {
    expect(sameHeartRateTitle('run', 145, 'metric')).toBe(
      'Your output at 145 bpm, flat pace per kilometre',
    )
    expect(sameHeartRateTitle('ride', 150, 'metric')).toBe('Your output at 150 bpm, power in watts')
  })
})

describe('the weekly view’s words', () => {
  it('names no change for any data: the fitness status is the sport’s voice on that', () => {
    const rising = data([198, 200, 203, 207, 210, 212, 214, 216])
    expect(sameHeartRateLackText('ride', rising)).toBeNull()
    expect(sameHeartRateTitle('ride', 145, 'metric')).not.toMatch(/more|less|faster|slower|change/i)
  })

  it('names what is missing, in a muted line, when there is nothing to draw', () => {
    expect(
      sameHeartRateLackText('run', { ...data([null, null], false), lacks: 'activities' }),
    ).toBe(LACK_TEXT.activities('run'))
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
    expect(sameHeartRateLackText('ride', none)).toBe(LACK_TEXT.blocks('ride'))
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
