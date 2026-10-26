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
  it('draws no outline when the app moves focus to the heading', () => {
    expect(ruleBody(baseCss, "h1[tabindex='-1']:focus")).toMatch(/outline:\s*none/)
  })

  it('underlines the heading only for keyboard focus, so a click that moves focus does not look like a link', () => {
    expect(ruleBody(baseCss, "h1[tabindex='-1']:focus-visible")).toMatch(
      /text-decoration:\s*underline/,
    )
    expect(ruleBody(baseCss, "h1[tabindex='-1']:focus")).not.toMatch(/text-decoration/)
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

describe('headings', () => {
  it('wraps every heading with pretty wrapping, so a single word is not left on the last line', () => {
    expect(ruleBody(baseCss, 'h1')).toMatch(/text-wrap:\s*pretty/)
    expect(ruleBody(baseCss, 'h2')).toMatch(/text-wrap:\s*pretty/)
    expect(ruleBody(baseCss, 'h3')).toMatch(/text-wrap:\s*pretty/)
  })
})
