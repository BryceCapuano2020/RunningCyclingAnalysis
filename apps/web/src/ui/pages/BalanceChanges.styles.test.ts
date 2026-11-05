import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './BalanceChanges.css')
const rows = await readStylesheet(import.meta.url, '../components/RowList.css')

describe('What changed', () => {
  it('is rows between hairlines at every width, never cards in a grid', () => {
    expect(css).not.toMatch(/grid-template-columns|border:|background|box-shadow|@media/)
    expect(ruleBody(rows, '.row')).toMatch(/border-top:\s*1px solid var\(--hairline\)/)
    expect(ruleBody(rows, '.row:last-child')).toMatch(
      /border-bottom:\s*1px solid var\(--hairline\)/,
    )
  })

  it('sets a row’s index in its sport’s ink, in the mono meta size', () => {
    const index = ruleBody(rows, '.row__index')
    expect(index).toMatch(/color:\s*var\(--sport-ink\)/)
    expect(index).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(index).toMatch(/font-size:\s*var\(--text-meta\)/)
  })

  it('keeps its one line of prose to the reading measure', () => {
    expect(ruleBody(css, '.balance-changes__empty')).toMatch(/max-width:\s*var\(--measure\)/)
  })
})
