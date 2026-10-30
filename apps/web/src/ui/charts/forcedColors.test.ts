import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const seriesCss = await readStylesheet(import.meta.url, './ChartSeries.css')
const ratioCss = await readStylesheet(import.meta.url, './RatioChart.css')
const scatterCss = await readStylesheet(import.meta.url, './HrScatter.css')
const legendCss = await readStylesheet(import.meta.url, './ChartLegend.css')
const tooltipCss = await readStylesheet(import.meta.url, './ChartTooltip.css')
const volumeCss = await readStylesheet(import.meta.url, './WeeklyVolumeChart.css')
const breakCss = await readStylesheet(import.meta.url, './AxisBreaks.css')
const splitsCss = await readStylesheet(import.meta.url, '../components/SplitsTable.css')
const bestsCss = await readStylesheet(import.meta.url, './BestsOverTimeChart.css')

/** The rules inside a stylesheet's forced-colours block, which the browser applies in place of the tints. */
function forcedBody(css: string): string {
  const start = css.indexOf('@media (forced-colors: active) {')
  if (start === -1) return ''
  const end = css.indexOf('\n}', start)
  return css.slice(start, end === -1 ? undefined : end)
}

describe('forced colours keep the chart marks visible', () => {
  it('gives the ratio chart bands an outline and the median a system colour', () => {
    const forced = forcedBody(ratioCss)
    expect(forced).toMatch(/\.ratio-chart__band \{[^}]*stroke: CanvasText/)
    expect(forced).toMatch(/\.ratio-chart__median \{[^}]*stroke: CanvasText/)
    expect(forced).toMatch(/\.ratio-chart__marker \{[^}]*fill: CanvasText/)
  })

  it('gives the curve and trend markers a system fill and a ring the page colour', () => {
    const forced = forcedBody(seriesCss)
    expect(forced).toMatch(/\.chart-series__marker \{[^}]*fill: CanvasText/)
    expect(forced).toMatch(/\.chart-series__marker \{[^}]*stroke: Canvas/)
    expect(ruleBody(seriesCss, '.chart-series__ring--ride')).toMatch(/stroke: var/)
    expect(forced).toMatch(/\.chart-series__ring--ride \{[^}]*stroke: Highlight/)
  })

  it('draws the run and ride line keys as system-coloured lines in the legend and the tooltip', () => {
    expect(forcedBody(legendCss)).toMatch(
      /\.chart-legend__key--line \{[^}]*border-top: 2px solid CanvasText/,
    )
    expect(forcedBody(tooltipCss)).toMatch(
      /\.chart-tooltip__key \{[^}]*border-top: 2px solid CanvasText/,
    )
  })

  it('keeps the dashed estimate and previous keys dashed in the tooltip, in forced colours', () => {
    expect(forcedBody(tooltipCss)).toMatch(
      /\.chart-tooltip__key--dashed \{[^}]*border-top-style: dashed/,
    )
  })

  it('gives the previous period’s line a system colour in forced colours, so it stays visible', () => {
    expect(forcedBody(seriesCss)).toMatch(
      /\.chart-series__line--previous \{[^}]*stroke: CanvasText/,
    )
  })

  it('gives the heart-rate dots a system fill, so they read without their tints', () => {
    const forced = forcedBody(scatterCss)
    expect(forced).toMatch(/\.hr-scatter__dot \{[^}]*fill: CanvasText/)
  })

  it('gives the legend fills the colours the weekly volume bars take, so the key matches the bars', () => {
    const key = forcedBody(legendCss)
    const bars = forcedBody(volumeCss)
    expect(key).toMatch(/\.swatch-run,\s*\.chart-legend__key--run \{[^}]*background: CanvasText/)
    expect(key).toMatch(/\.swatch-ride,\s*\.chart-legend__key--ride \{[^}]*background: Highlight/)
    expect(bars).toMatch(/\.volume-bar \{[^}]*fill: Highlight/)
    expect(bars).toMatch(/\.volume-bar\[data-sport='run'\] \{[^}]*fill: CanvasText/)
  })

  it('keeps the break mark of a skipped stretch of the axis visible, in a system colour', () => {
    expect(forcedBody(breakCss)).toMatch(
      /\.axis-break__line,\s*\.axis-break__slash \{[^}]*stroke: GrayText/,
    )
  })

  it('outlines the stacked volume bars in the page colour, so the parts stay apart without a gap of tint', () => {
    expect(forcedBody(volumeCss)).toMatch(/\.volume-bar \{[^}]*stroke: Canvas/)
  })

  it('outlines the splits pace track and fills the bar with the highlight, since both fills are dropped', () => {
    const forced = forcedBody(splitsCss)
    expect(forced).toMatch(/\.splits-table__track \{[^}]*border: 1px solid CanvasText/)
    expect(forced).toMatch(/\.splits-table__bar \{[^}]*background: Highlight/)
  })

  describe('forced colours tell the two sports apart by their edges', () => {
    it('draws the ride marker hollow, so it differs from the solid run marker by more than colour', () => {
      const forced = forcedBody(seriesCss)
      expect(forced).toMatch(/\.chart-series__marker--ride \{[^}]*fill: Canvas/)
      expect(forced).toMatch(/\.chart-series__marker--ride \{[^}]*stroke: CanvasText/)
      expect(forced).toMatch(/\.chart-series__marker--run \{[^}]*fill: CanvasText/)
    })
  })

  describe('forced colours tell the heart-rate dots apart by their edges', () => {
    it('draws the run dots solid and the ride dots hollow, as the trend and curve markers do', () => {
      const forced = forcedBody(scatterCss)
      expect(forced).toMatch(/\.hr-scatter__dot--run \{[^}]*fill: CanvasText/)
      expect(forced).toMatch(/\.hr-scatter__dot--ride \{[^}]*fill: Canvas/)
      expect(forced).toMatch(/\.hr-scatter__dot--ride \{[^}]*stroke: CanvasText/)
    })
  })

  it('draws an older dated best hollow, since forced colours ignore the opacity that shows its age, and an older ride’s ring dashed', () => {
    const forced = forcedBody(bestsCss)
    expect(forced).toMatch(/\.chart-series__marker\.bests-dot--old \{[^}]*fill: Canvas/)
    expect(forced).toMatch(/\.chart-series__marker\.bests-dot--old \{[^}]*stroke: CanvasText/)
    expect(forced).toMatch(/\.chart-series__marker--ride\.bests-dot--old \{[^}]*stroke-dasharray/)
  })
})
