import { describe, expect, it } from 'vitest'
import { MAX_FIELD_CHARS } from './limits'
import { appendField } from './trackpoints'

describe('appendField', () => {
  it('joins short pieces as they come', () => {
    expect(appendField('', 'ab')).toBe('ab')
    expect(appendField('ab', 'cd')).toBe('abcd')
  })

  it('keeps one character past the cap, so an overlong field is still seen as overlong', () => {
    const grown = appendField('', 'x'.repeat(5 * MAX_FIELD_CHARS))
    expect(grown).toHaveLength(MAX_FIELD_CHARS + 1)
  })

  it('stops growing once the cap is passed, whatever is appended and however often', () => {
    let text = ''
    for (let i = 0; i < 4_000; i++) text = appendField(text, 'y'.repeat(100))
    expect(text).toHaveLength(MAX_FIELD_CHARS + 1)
    expect(appendField(text, 'more')).toBe(text)
  })

  it('cuts a piece that crosses the cap and keeps what came before it', () => {
    const before = 'a'.repeat(MAX_FIELD_CHARS - 2)
    const grown = appendField(before, 'bcdef')
    expect(grown).toBe(`${before}bcd`)
  })
})
