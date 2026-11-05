import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './MethodText.css')

describe('method text', () => {
  it('sets prose in the serif at --text-md, one column at the reading measure', () => {
    const rule = ruleBody(css, '.method__text')
    expect(rule).toMatch(/max-width:\s*var\(--measure\)/)
    expect(rule).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(rule).toMatch(/font-size:\s*var\(--text-md\)/)
    expect(rule).not.toMatch(/columns:/)
  })

  it('keeps a heading clear of what is above it', () => {
    expect(ruleBody(css, '.method__text > h3')).toMatch(/margin-top:\s*var\(--space-4\)/)
  })
})
