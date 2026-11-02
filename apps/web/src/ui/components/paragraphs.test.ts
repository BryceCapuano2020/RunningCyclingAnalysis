import { describe, expect, it } from 'vitest'
import { PARAGRAPH_CHARS, paragraphsOf } from './paragraphs'

describe('paragraphsOf', () => {
  it('joins short lines into one paragraph, in order, and never splits or drops a line', () => {
    const lines = ['One fact.', 'Another fact.', 'A third fact.']
    expect(paragraphsOf(lines)).toEqual([lines])
  })

  it('starts a new paragraph when the next line would pass the limit', () => {
    const a = 'a'.repeat(60)
    const b = 'b'.repeat(50)
    expect(paragraphsOf([a, b, a], 120)).toEqual([[a, b], [a]])
    expect(paragraphsOf([a, b], 111)).toEqual([[a, b]])
    expect(paragraphsOf([a, b], 110)).toEqual([[a], [b]])
  })

  it('gives a line longer than the limit a paragraph of its own', () => {
    const long = 'x'.repeat(PARAGRAPH_CHARS + 40)
    expect(paragraphsOf(['short.', long, 'short again.'])).toEqual([
      ['short.'],
      [long],
      ['short again.'],
    ])
  })

  it('keeps every line exactly once for any list', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Line ${i} says one thing.`)
    expect(paragraphsOf(lines).flat()).toEqual(lines)
    for (const paragraph of paragraphsOf(lines)) {
      expect(paragraph.join(' ').length).toBeLessThanOrEqual(PARAGRAPH_CHARS)
    }
  })
})
