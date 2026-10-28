import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SportRecords.css')

describe('SportRecords: a shared activity name on a phone', () => {
  it('wraps an unbroken name anywhere, so a 119-character name cannot widen the page at 390 px', () => {
    expect(ruleBody(css, '.records__shared .records__link')).toContain('overflow-wrap: anywhere;')
  })
})

describe('SportRecords: a record row’s link on a phone', () => {
  it('cuts the name short and keeps the date whole', () => {
    expect(ruleBody(css, '.records__name')).toContain('text-overflow: ellipsis;')
    expect(ruleBody(css, '.records__name')).toContain('overflow: hidden;')
    expect(ruleBody(css, '.records__date')).toContain('flex: none;')
    expect(ruleBody(css, '.records__date')).toContain('white-space: nowrap;')
    // The link itself no longer clips, which is what took the date off with the name's end.
    expect(ruleBody(css, '.records__link')).not.toContain('text-overflow')
    expect(ruleBody(css, '.records__link')).not.toContain('overflow: hidden')
  })
})
