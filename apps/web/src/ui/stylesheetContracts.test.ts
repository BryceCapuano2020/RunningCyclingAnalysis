import { describe, expect, it } from 'vitest'
import {
  NARROW_PHONE_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  PROFILE_PAIR_MIN_WIDTH_PX,
  SHORT_PHONE_MAX_HEIGHT_PX,
  SMALL_PHONE_MAX_WIDTH_PX,
} from './layoutBreakpoints'
import { readStylesheet, ruleBody } from './test/stylesheet'

/*
 * What a stylesheet must agree on with something outside it: a breakpoint constant, DESIGN.md, or
 * another stylesheet. The rendered checks (visual, reflow, target-size, forced-colours) guard how the
 * page looks; none of them can see that two files name the same number.
 */

const read = (path: string) => readStylesheet(import.meta.url, path)

describe('breakpoints named in layoutBreakpoints.ts appear in the stylesheets that use them', () => {
  it('names each width and height in the sheet that depends on it', async () => {
    const expected: [string, string][] = [
      ['./components/ImportStatus.css', `@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`],
      ['./components/AthleteFields.css', `@media (max-width: ${SMALL_PHONE_MAX_WIDTH_PX}px)`],
      [
        './components/SetupDialog.css',
        `@media (max-width: ${NARROW_PHONE_MAX_WIDTH_PX}px) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px)`,
      ],
      ['./pages/ProfilePage.css', `@media (min-width: ${PROFILE_PAIR_MIN_WIDTH_PX}px)`],
      ['../App.css', `(max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse)`],
    ]
    for (const [path, query] of expected) {
      expect(await read(path), path).toContain(query)
    }
  })
})

describe('DESIGN.md states the layout numbers the stylesheets use', () => {
  it('names the short-phone height and the landing example’s level triangle', async () => {
    const design = await read('../../../../docs/DESIGN.md')
    expect(design).toContain(`${SHORT_PHONE_MAX_HEIGHT_PX} px in height`)
    expect(design).toContain(`${SHORT_PHONE_MAX_HEIGHT_PX} px tall`)
    expect(design).toMatch(/landing example is drawn from the same sample[^.]*level triangle/)
  })
})

describe('the chart legend keys match the lines they key', () => {
  it('draws an estimate key at the width of the line, and the previous key at the previous line’s 1.5 px', async () => {
    const legend = await read('./charts/ChartLegend.css')
    const series = await read('./charts/ChartSeries.css')
    const width = (body: string, property: string) =>
      new RegExp(`${property}:\\s*([\\d.]+px)`).exec(body)?.[1]
    const line = width(ruleBody(series, '.chart-series__line'), 'stroke-width')
    expect(line).toBeDefined()
    for (const sport of ['run', 'ride']) {
      expect(
        width(ruleBody(legend, `.chart-legend__key--dashed-${sport}`), 'border-top-width'),
      ).toBe(line)
    }
    expect(ruleBody(legend, '.chart-legend__key--previous')).toContain('1.5px solid')
    expect(width(ruleBody(series, '.chart-series__line--previous'), 'stroke-width')).toBe('1.5px')
  })
})
