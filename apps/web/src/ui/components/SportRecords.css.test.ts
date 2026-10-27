import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SportRecords.css')

describe('SportRecords: a shared activity name on a phone', () => {
  it('wraps an unbroken name anywhere, so a 119-character name cannot widen the page at 390 px', () => {
    expect(ruleBody(css, '.records__shared .records__link')).toContain('overflow-wrap: anywhere;')
  })
})
