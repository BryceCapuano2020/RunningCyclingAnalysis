import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './HowThisWorks.css')

describe('How this works list', () => {
  it('sets the entries in one column at the reading measure, with no columns', () => {
    const rule = ruleBody(css, '.how__entries')
    expect(rule).toMatch(/max-width:\s*var\(--measure\)/)
    expect(rule).not.toMatch(/columns:/)
  })

  it('rules each entry between hairlines and names it in the serif at the row title size', () => {
    expect(ruleBody(css, '.how__entry')).toMatch(/border-top:\s*1px solid var\(--hairline\)/)
    const name = ruleBody(css, '.how__entry dt')
    expect(name).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(name).toMatch(/font-size:\s*var\(--heading\)/)
  })

  it('holds an entry’s lines to the reading measure', () => {
    expect(ruleBody(css, '.how__entry dd')).toMatch(/max-width:\s*var\(--measure\)/)
  })
})
