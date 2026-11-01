// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { BestEffort } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { METRES_PER_MILE } from '@rca/core/units'
import { bestsModel } from './bestsByYearModel'
import { bestsChartHeight, bestsLayout } from './bestsByYearLayout'
import type { PanelLayout } from './bestsByYearLayout'
import type { ChartSize } from './chartTypes'
import { plotBoxOf } from './plotBox'

/** A chart as wide as a desktop card, with room for the panels it is asked to hold. */
function sizeFor(panels: number, width = 900): ChartSize {
  const height = bestsChartHeight(panels)
  return {
    width,
    height,
    plot: plotBoxOf(width, height, undefined, 30),
    tooltipId: 't',
    hintId: 'h',
    titleId: 'i',
  }
}

/** The panels of a sport's bests, each given as the best (a time in s over a mile, or watts) of consecutive years from 2015. */
function layoutOf(sport: Sport, series: number[][]) {
  const efforts: BestEffort[] = series.map((values) => ({
    length: sport === 'run' ? METRES_PER_MILE : 300,
    years: values.map((value, i) => [2015 + i, value, true, false]),
  }))
  const model = bestsModel(sport, efforts, 'imperial')!
  return bestsLayout(model, sizeFor(series.length))!
}

const heightOf = (panel: PanelLayout) => panel.box.bottom - panel.box.top
const ys = (panel: PanelLayout) =>
  panel.points.flatMap((point) => (point === null ? [] : [point.y]))

/** The all-time best's label sits in the panel's top; the data fills the rest. */
const spread = (panel: PanelLayout) =>
  (Math.max(...ys(panel)) - Math.min(...ys(panel))) / heightOf(panel)

describe('a bests panel on a long library', () => {
  // A mile pace that begins slow and settles, as seconds a mile: 9:40 down to 6:20 and back to 6:50.
  const SLOW_START = [580, 600, 440, 400, 380, 395, 410]

  it('fits its pace axis to its own values and never starts at 0:00', () => {
    const [panel] = layoutOf('run', [SLOW_START]).panels
    const labels = panel!.yTicks.map((tick) => tick.label)
    expect(labels).not.toContain('0:00')
    // Every tick lies in the range the data and its margin cover, a few minutes round 6:20 to 10:00.
    for (const label of labels) {
      const [min = 0] = label.split(':').map(Number)
      expect(min).toBeGreaterThanOrEqual(5)
      expect(min).toBeLessThanOrEqual(10)
    }
    // The line uses the panel: the best and the slowest year are most of its height apart.
    expect(spread(panel!)).toBeGreaterThan(0.55)
  })

  it('draws the faster pace higher', () => {
    const [panel] = layoutOf('run', [SLOW_START]).panels
    const fastest = panel!.points[4]!
    const slowest = panel!.points[1]!
    expect(fastest.y).toBeLessThan(slowest.y)
  })

  it('does not force zero on a ride panel, and fits it the same way', () => {
    const [panel] = layoutOf('ride', [[210, 230, 260, 300, 310, 290]]).panels
    const labels = panel!.yTicks.map((tick) => tick.label)
    expect(labels).not.toContain('0')
    expect(Math.min(...labels.map(Number))).toBeGreaterThan(150)
    expect(spread(panel!)).toBeGreaterThan(0.55)
    // The higher power is higher on the panel.
    expect(panel!.points[4]!.y).toBeLessThan(panel!.points[0]!.y)
  })

  it('keeps one tick style: two or three ticks, on the half minute for a pace and on a round number of watts for power', () => {
    const run = layoutOf('run', [
      [330, 340, 335],
      [580, 600, 440, 400],
      [500, 520, 700, 650],
      [420, 480, 560],
      [640, 660, 720],
    ])
    for (const panel of run.panels) {
      expect(panel.yTicks.length).toBeGreaterThanOrEqual(2)
      expect(panel.yTicks.length).toBeLessThanOrEqual(3)
      for (const tick of panel.yTicks) expect(tick.label).toMatch(/^\d+:(00|30)$/)
    }
    const ride = layoutOf('ride', [
      [900, 950, 1010],
      [250, 270, 300],
      [180, 200, 190],
    ])
    for (const panel of ride.panels) {
      expect(panel.yTicks.length).toBeGreaterThanOrEqual(2)
      expect(panel.yTicks.length).toBeLessThanOrEqual(3)
      for (const tick of panel.yTicks) expect(Number(tick.label.replace(',', '')) % 5).toBe(0)
    }
  })

  it('keeps every point and tick inside its panel, and fills it, over a sweep of spans', () => {
    const series = [60, 120, 240, 480].flatMap((span) =>
      [300, 420, 600, 840].map((base) => [base, base + span, base + span / 3, base + span / 2]),
    )
    const { panels } = layoutOf('run', series)
    for (const panel of panels) {
      for (const point of panel.points) {
        expect(point!.y).toBeGreaterThanOrEqual(panel.box.top)
        expect(point!.y).toBeLessThanOrEqual(panel.box.bottom)
      }
      for (const tick of panel.yTicks) {
        expect(tick.position).toBeGreaterThanOrEqual(panel.box.top)
        expect(tick.position).toBeLessThanOrEqual(panel.box.bottom)
      }
      expect(panel.yTicks.length).toBeGreaterThanOrEqual(2)
      expect(spread(panel)).toBeGreaterThan(0.45)
    }
  })
})

describe('a bests panel with one point', () => {
  it('sits the point in the middle of its panel with a tick above and below it', () => {
    const run = layoutOf('run', [[680]])
    const [panel] = run.panels
    const [point] = ys(panel!)
    const { top, bottom } = panel!.box
    expect(point!).toBeGreaterThan(top + (bottom - top) * 0.3)
    expect(point!).toBeLessThan(top + (bottom - top) * 0.7)
    const ticks = panel!.yTicks.map((tick) => tick.position)
    expect(Math.min(...ticks)).toBeLessThan(point!)
    expect(Math.max(...ticks)).toBeGreaterThan(point!)
    expect(panel!.yTicks.every((tick) => /^\d+:\d\d$/.test(tick.label))).toBe(true)
  })

  it('does the same for a ride', () => {
    const [panel] = layoutOf('ride', [[265]]).panels
    const [point] = ys(panel!)
    const ticks = panel!.yTicks.map((tick) => tick.position)
    expect(Math.min(...ticks)).toBeLessThan(point!)
    expect(Math.max(...ticks)).toBeGreaterThan(point!)
    expect(panel!.yTicks.map((tick) => tick.label)).not.toContain('0')
  })
})

describe('the height of the panels', () => {
  it('sets each panel name close over its own panel, inside the room above its data', () => {
    const [panel] = layoutOf('run', [[400, 410]]).panels
    expect(panel!.axisBox.top).toBeGreaterThan(panel!.box.top)
    expect(panel!.axisBox.top - panel!.box.top).toBeLessThan(16)
    expect(panel!.axisBox.bottom).toBe(panel!.box.bottom)
  })

  it('keeps each panel short, so that five read as small multiples', () => {
    const { panels } = layoutOf('run', [[400], [410], [420], [430], [440]])
    for (const panel of panels) expect(heightOf(panel)).toBeLessThanOrEqual(64)
    // Five panels took 598 px at 84 px each.
    expect(bestsChartHeight(5)).toBeLessThan(510)
  })
})
