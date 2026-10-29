import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { linearScale } from './scale'
import type { PlotBox } from './chartTypes'
import { axisFontSize, rootScale } from './ticks'
import {
  labelExtent,
  shortDate,
  shortDateWithYear,
  trendDateTicks,
  trendXTicks,
} from './trendTicks'

/** Sunday 12 January 2025 and the Sundays that follow it, as the trend ends its weeks. */
const FIRST = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const weeks = (count: number) => Array.from({ length: count }, (_, i) => FIRST + i * 7 * DAY_MS)
const x = linearScale([FIRST, FIRST + 100 * DAY_MS], [0, 100])

describe('shortDate', () => {
  it('names the UTC day and month of an instant, such as 12 Jan', () => {
    expect(shortDate(FIRST)).toBe('12 Jan')
  })
})

describe('shortDateWithYear', () => {
  it('adds the UTC year, such as 12 Jan 2025', () => {
    expect(shortDateWithYear(FIRST)).toBe('12 Jan 2025')
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
      '12 Jan 2025',
      'Feb 2025',
      'Mar 2025',
      'Apr 2025',
      'May 2025',
      '8 Jun',
    ])
    expect(ticks[0]?.position).toBe(x(ends[0]!))
    expect(ticks.at(-1)?.position).toBe(x(ends.at(-1)!))
  })

  it('names the first sample by its month and year once the span is past 26 weeks', () => {
    const ends = weeks(40)
    const ticks = trendDateTicks(ends, linearScale([ends[0]!, ends.at(-1)!], [0, 100]))
    expect(ticks[0]?.label).toBe('Jan 2025')
    expect(ticks.at(-1)?.label).toBe('12 Oct')
  })

  it('gives no ticks to fewer than two samples', () => {
    expect(trendDateTicks(weeks(1), x)).toEqual([])
    expect(trendDateTicks([], x)).toEqual([])
  })
})

describe('trendXTicks', () => {
  /** Weekly ends over several years, as an all-time trend runs. */
  const years = (count: number) =>
    Array.from({ length: count * 52 }, (_, i) => Date.UTC(2015, 0, 4) + i * 7 * DAY_MS)

  /** Whether any two labels meet as the axis draws them, with the 8 px they keep. */
  function meets(ticks: { position: number; label: string }[], plot: PlotBox, width: number) {
    const extents = ticks.map((tick) => labelExtent(tick, plot, axisFontSize(width), rootScale()))
    return extents.some((extent, i) => i + 1 < extents.length && extent[1] + 8 > extents[i + 1]![0])
  }

  it('keeps no two labels touching, at a phone’s width and a desktop’s, over eleven years', () => {
    for (const width of [320, 390, 640, 1000]) {
      const plot: PlotBox = { left: 56, right: width - 70, top: 28, bottom: 200 }
      const ends = years(11)
      const x = linearScale([ends[0]!, ends.at(-1)!], [plot.left, plot.right])
      const ticks = trendXTicks(ends, x, { width, plot })
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(meets(ticks, plot, width)).toBe(false)
    }
  })

  it('keeps the first and last labels, which name the span, and drops an inner one that would touch them', () => {
    const width = 390
    const plot: PlotBox = { left: 56, right: 300, top: 28, bottom: 200 }
    const ends = years(6)
    const x = linearScale([ends[0]!, ends.at(-1)!], [plot.left, plot.right])
    const ticks = trendXTicks(ends, x, { width, plot })
    expect(ticks[0]?.label).toBe('Jan 2015')
    expect(ticks.at(-1)?.position).toBe(x(ends.at(-1)!))
  })
})
