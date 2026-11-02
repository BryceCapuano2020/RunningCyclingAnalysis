import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './HowThisWorks.css')

describe('How this works list', () => {
  it('sets the entries in columns at the reading measure, two at most', () => {
    const rule = ruleBody(css, '.how__entries')
    expect(rule).toMatch(/columns:\s*var\(--measure\) 2/)
    expect(rule).toMatch(/max-width:\s*calc\(var\(--measure\) \* 2 \+ var\(--space-6\)\)/)
  })

  it('keeps an entry whole in one column, so its name never parts from its lines', () => {
    expect(ruleBody(css, '.how__entry')).toMatch(/break-inside:\s*avoid/)
  })

  it('holds an entry’s lines to the reading measure', () => {
    expect(ruleBody(css, '.how__entry dd')).toMatch(/max-width:\s*var\(--measure\)/)
  })
})
