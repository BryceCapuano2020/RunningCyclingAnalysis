import { describe, expect, it } from 'vitest'
import { SAME_HEART_RATE } from '@rca/core/constants'
import type { Lack, SameHeartRate, SameHeartRateChange, SameHeartRateWeek } from '@rca/core/digest'
import { sameHeartRateCopy, sameHeartRateTitle, LACK_TEXT } from './sameHeartRateCopy'

const WEEK_MS = 7 * 86_400_000

function week(index: number, output: number | null): SameHeartRateWeek {
  return {
    endMs: Date.UTC(2025, 2, 2) + index * WEEK_MS,
    fit: output === null ? null : { output, low: output * 0.98, high: output * 1.02 },
    lacks: output === null ? 'blocks' : null,
    blocks: 12,
    activities: 5,
  }
}

function data(
  change: Partial<SameHeartRateChange> | null,
  outputs: (number | null)[],
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

describe('the sentence', () => {
  it('says a real change in a run as the pace now against the pace before', () => {
    // 3.0 m/s is 5:33/km and 2.7 m/s is 6:10/km.
    const copy = sameHeartRateCopy(
      'run',
      data({ from: 2.7, to: 3.0, real: true }, [2.7, 2.8, 3.0]),
      'metric',
    )
    expect(copy).toEqual({
      kind: 'change',
      text: 'At 145 bpm you now run 5:33 /km, against 6:10 /km 8 weeks ago.',
    })
  })

  it('says a real change in a ride in watts', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 198, to: 214, real: true }, [198, 205, 214]),
      'metric',
    )
    expect(copy.text).toBe('At 145 bpm you now ride 214 W, against 198 W 8 weeks ago.')
  })

  it('says a fall as plainly as a rise', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 214, to: 198, real: true }, [214, 205, 198]),
      'metric',
    )
    expect(copy.text).toBe('At 145 bpm you now ride 198 W, against 214 W 8 weeks ago.')
  })

  it('says one week ago in the singular', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 198, to: 214, real: true, weeksApart: 1 }, [198, 214]),
      'metric',
    )
    expect(copy.text).toContain('1 week ago')
  })

  it('says it has held, within the error, when the intervals overlap', () => {
    const copy = sameHeartRateCopy(
      'ride',
      data({ from: 204, to: 207 }, [204, null, 207, 205, 206]),
      'metric',
    )
    expect(copy).toEqual({
      kind: 'held',
      text: 'At 145 bpm your power has held at about 206 W, within the error.',
    })
  })

  it('says a run that held in pace', () => {
    const copy = sameHeartRateCopy('run', data({}, [2.8, 2.8, 2.8]), 'metric')
    expect(copy.text).toBe('At 145 bpm your pace has held at about 5:57 /km, within the error.')
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
    }
    expect(sameHeartRateCopy('ride', none, 'metric').text).toBe(LACK_TEXT.blocks('ride'))
  })

  it('never calls it fitness, or a strength or a limit', () => {
    const words = /fitness|limiter|weak|strength|holding you back|ahead of/i
    const lacks: Lack[] = ['blocks', 'activities', 'weeks', 'spread', 'range', 'period']
    for (const lack of lacks)
      for (const sport of ['run', 'ride'] as const) {
        expect(LACK_TEXT[lack](sport)).not.toMatch(words)
      }
  })

  it('states the thresholds from the constants', () => {
    expect(LACK_TEXT.blocks('run')).toContain(String(SAME_HEART_RATE.minBlocks))
    expect(LACK_TEXT.activities('ride')).toContain(`${SAME_HEART_RATE.minActivities} rides`)
    expect(LACK_TEXT.spread('run')).toContain(String(SAME_HEART_RATE.minSpreadBpm))
  })
})
