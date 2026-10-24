import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../ui/components/stylesheet'

const baseCss = await readStylesheet(import.meta.url, './base.css')
const componentsCss = await readStylesheet(import.meta.url, './components.css')
const chartFrameCss = await readStylesheet(import.meta.url, '../ui/charts/ChartFrame.css')

describe('chart frames on a phone', () => {
  it('give the figure one column that can shrink, so an open table scrolls rather than widening the page', () => {
    expect(ruleBody(chartFrameCss, '.chart-frame')).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    )
    expect(ruleBody(chartFrameCss, '.chart-frame__details')).toMatch(/min-width:\s*0/)
  })
})

describe('focus on a page heading', () => {
  it('draws no outline when the app moves focus to the heading, and an underline instead', () => {
    const body = ruleBody(baseCss, "h1[tabindex='-1']:focus")
    expect(body).toMatch(/outline:\s*none/)
    expect(body).toMatch(/text-decoration:\s*underline/)
  })
})

describe('reduced motion', () => {
  it('covers pseudo-elements, which the disclosure chevron animates', () => {
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{/,
    )
  })
})

describe('hero numbers', () => {
  it('are blocks, so a line box cannot overlap the eyebrow above them', () => {
    expect(ruleBody(componentsCss, '.hero-number')).toMatch(/display:\s*block/)
  })
})
