import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SportRecords.css')

describe('SportRecords: a shared activity name on a phone', () => {
  it('wraps an unbroken name anywhere, so a 119-character name cannot widen the page at 390 px', () => {
    expect(ruleBody(css, '.records__shared .records__link')).toContain('overflow-wrap: anywhere;')
  })
})

describe('SportRecords: a record row’s link on a phone', () => {
  it('keeps the dot in the activity’s own item, which does not shrink the count away', () => {
    expect(ruleBody(css, '.records__where')).toContain('display: flex;')
    expect(ruleBody(css, '.records__dot')).toContain('flex: none;')
  })

  it('wraps the count under the link rather than shrinking the name to make room for it', () => {
    expect(ruleBody(css, '.records__source')).toContain('flex-wrap: wrap;')
  })

  it('wraps the whole name, never cutting it, and keeps the date whole', () => {
    expect(ruleBody(css, '.records__name')).toContain('overflow-wrap: anywhere;')
    expect(ruleBody(css, '.records__name')).not.toContain('text-overflow')
    expect(ruleBody(css, '.records__name')).not.toContain('overflow: hidden;')
    expect(ruleBody(css, '.records__link')).toContain('flex-wrap: wrap;')
    expect(ruleBody(css, '.records__date')).toContain('flex: none;')
    expect(ruleBody(css, '.records__date')).toContain('white-space: nowrap;')
    // The link itself no longer clips, which is what took the date off with the name's end.
    expect(ruleBody(css, '.records__link')).not.toContain('text-overflow')
    expect(ruleBody(css, '.records__link')).not.toContain('overflow: hidden')
  })
})
