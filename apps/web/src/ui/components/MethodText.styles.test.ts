import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './MethodText.css')

describe('method text columns', () => {
  it('sets prose in columns as wide as the reading measure, two at most', () => {
    const rule = ruleBody(css, '.method__text')
    expect(rule).toMatch(/columns:\s*var\(--measure\) 2/)
    // Two measures and the gap between them, so the columns stay at the measure however wide the page.
    expect(rule).toMatch(/max-width:\s*calc\(var\(--measure\) \* 2 \+ var\(--space-6\)\)/)
  })

  it('keeps a paragraph whole in one column, and lets a list continue in the next with each fact whole', () => {
    expect(ruleBody(css, '.method__text > *')).toMatch(/break-inside:\s*avoid/)
    expect(ruleBody(css, '.method__text > ul')).toMatch(/break-inside:\s*auto/)
    expect(ruleBody(css, '.method__text > ul > li')).toMatch(/break-inside:\s*avoid/)
  })

  it('keeps a heading with the lines that follow it, and clear of what is above it', () => {
    const heading = ruleBody(css, '.method__text > h3')
    expect(heading).toMatch(/break-after:\s*avoid/)
    expect(heading).toMatch(/margin-top:\s*var\(--space-4\)/)
  })
})
