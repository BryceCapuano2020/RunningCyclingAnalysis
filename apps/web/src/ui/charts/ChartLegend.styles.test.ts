import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const legendCss = await readStylesheet(import.meta.url, './ChartLegend.css')
const seriesCss = await readStylesheet(import.meta.url, './ChartSeries.css')

/** The width a rule gives, from its stroke-width or its border-top-width. */
function widthOf(body: string, property: 'stroke-width' | 'border-top-width'): string | undefined {
  return new RegExp(`${property}:\\s*([\\d.]+px)`).exec(body)?.[1]
}

describe('the chart legend’s dashed keys', () => {
  it('draw an estimate at the width of the line they key, so the swatch is not fainter than the line', () => {
    const line = widthOf(ruleBody(seriesCss, '.chart-series__line'), 'stroke-width')
    expect(line).toBeDefined()
    for (const sport of ['run', 'ride']) {
      expect(
        widthOf(ruleBody(legendCss, `.chart-legend__key--dashed-${sport}`), 'border-top-width'),
      ).toBe(line)
    }
  })
})
