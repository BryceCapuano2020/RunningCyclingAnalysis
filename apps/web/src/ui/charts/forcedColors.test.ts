import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const seriesCss = await readStylesheet(import.meta.url, './ChartSeries.css')
const ratioCss = await readStylesheet(import.meta.url, './RatioChart.css')
const scatterCss = await readStylesheet(import.meta.url, './HrScatter.css')

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

  it('gives the heart-rate dots a system fill, so they read without their tints', () => {
    const forced = forcedBody(scatterCss)
    expect(forced).toMatch(/\.hr-scatter__dot \{[^}]*fill: CanvasText/)
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
})
