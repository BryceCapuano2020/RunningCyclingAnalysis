// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { WALKING_PACE } from '@rca/core/constants'
import type { SportYearCurves } from '@rca/core/history'
import type { ChartSize } from './chartTypes'
import { plotBoxOf } from './plotBox'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize, labelWidth, rootScale } from './ticks'
import { yearCurvesLayout, endLabelRoom } from './yearCurvesLayout'
import { yearCurvesModel } from './yearCurvesModel'

const WALK = WALKING_PACE.maxMovingSpeedMs - 0.3
const HEIGHT = 300

function sizeAt(width: number): ChartSize {
  return {
    width,
    height: HEIGHT,
    plot: plotBoxOf(width, HEIGHT, endLabelRoom(width), PLOT_BOTTOM_WITHOUT_X_TITLE),
    tooltipId: 't',
    hintId: 'h',
    titleId: 'i',
  }
}

/** Durations of 5 and 20 minutes, 1, 2 and 3 hours. */
const durations = [300, 1200, 3600, 7200, 10_800]

/** A speed, m/s, over a mile in this many seconds. */
const overMile = (seconds: number) => 1609.344 / seconds

/**
 * Eight years whose last values are all near the slowest pace on the axis, so their end labels crowd the plot's foot: the newest
 * is cut at 2 hours, the best year is 2021, and the oldest, in grey, sets the axis's slowest tick (14:00 a mile).
 */
function crowded(): SportYearCurves {
  return {
    durations,
    years: Array.from({ length: 8 }, (_, i) => {
      const end = overMile(i === 0 ? 839.9 : 834 - i * 0.3)
      const best = i === 3 ? 4.0 : 3.9
      const values = i === 7 ? [4.4, best, 3.0, end, WALK] : [4.4, best, 3.0, 2.6, end]
      return { year: 2018 + i, values, hard: true, estimated: [] }
    }),
  }
}

describe('the end labels of the year curves', () => {
  for (const width of [360, 480, 768, 1024, 1280]) {
    it(`keep clear of each other and inside the plot at ${width} px`, () => {
      const model = yearCurvesModel('run', crowded())!
      const size = sizeAt(width)
      const layout = yearCurvesLayout(model, 'imperial', size)!
      const { plot } = size
      expect(layout.labels.length).toBeGreaterThanOrEqual(3)
      const gap = axisFontSize(width) * rootScale()
      const ys = layout.labels.map((label) => label.y).sort((a, b) => a - b)
      ys.forEach((y, i) => {
        // Each label's text lies between the plot's top and bottom, so it stays off the axis labels under the plot.
        expect(y - gap / 2).toBeGreaterThanOrEqual(plot.top)
        expect(y + gap / 2).toBeLessThanOrEqual(plot.bottom)
        if (i > 0) expect(y - ys[i - 1]!).toBeGreaterThanOrEqual(gap)
      })
      // And inside the chart's right edge, in the room the chart keeps for them.
      for (const label of layout.labels) {
        const right = label.x + labelWidth('0000', axisFontSize(width), rootScale())
        expect(right).toBeLessThanOrEqual(width)
      }
    })
  }

  it('sit at the end of the line they name, the cut one before the plot edge', () => {
    const model = yearCurvesModel('run', crowded())!
    const layout = yearCurvesLayout(model, 'imperial', sizeAt(1024))!
    const xOf = (year: number) => layout.labels.find((label) => label.year === year)!.x
    // 2025 is the newest and ends at 2 hours; 2024 ends at 3.
    expect(xOf(2025)).toBeLessThan(xOf(2024))
  })
})
