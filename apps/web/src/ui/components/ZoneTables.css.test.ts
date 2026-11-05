import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './ZoneTables.css')

describe('ZoneTables stylesheet', () => {
  it('sets figures in mono and a zone name, which is a word, in the serif', () => {
    expect(ruleBody(css, '.zone-tables__rows td')).toMatch(/font-family:\s*var\(--font-mono\);/)
    expect(ruleBody(css, '.zone-tables__rows td.zone-tables__name')).toMatch(
      /font-family:\s*var\(--font-serif\);/,
    )
  })
})
