import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { linearScale } from './scale'
import { shortDate, trendDateTicks } from './trendTicks'

/** Sunday 12 January 2025 and the Sundays that follow it, as the trend ends its weeks. */
const FIRST = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const weeks = (count: number) => Array.from({ length: count }, (_, i) => FIRST + i * 7 * DAY_MS)
const x = linearScale([FIRST, FIRST + 100 * DAY_MS], [0, 100])

describe('shortDate', () => {
  it('names the UTC day and month of an instant, such as 12 Jan', () => {
    expect(shortDate(FIRST)).toBe('12 Jan')
  })
})

describe('trendDateTicks', () => {
  it('labels every sample’s week on a span under three months', () => {
    const ticks = trendDateTicks(weeks(6), x)
    expect(ticks.map((tick) => tick.label)).toEqual([
      '12 Jan',
      '19 Jan',
      '26 Jan',
      '2 Feb',
      '9 Feb',
      '16 Feb',
    ])
  })

  it('labels the first and last samples and the months between them on a longer span', () => {
    const ends = weeks(22)
    const ticks = trendDateTicks(ends, x)
    // The 1 June month start is within two weeks of the last sample, so it is left out.
    expect(ticks.map((tick) => tick.label)).toEqual([
      '12 Jan',
      'Feb 2025',
      'Mar 2025',
      'Apr 2025',
      'May 2025',
      '8 Jun',
    ])
    expect(ticks[0]?.position).toBe(x(ends[0]!))
    expect(ticks.at(-1)?.position).toBe(x(ends.at(-1)!))
  })

  it('gives no ticks to fewer than two samples', () => {
    expect(trendDateTicks(weeks(1), x)).toEqual([])
    expect(trendDateTicks([], x)).toEqual([])
  })
})
