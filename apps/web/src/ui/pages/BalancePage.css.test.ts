import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const page = await readStylesheet(import.meta.url, './BalancePage.css')

describe('Balance page stylesheet', () => {
  it('sets the answer in the serif at --display-2 at every width, with no size of its own on a phone', () => {
    expect(ruleBody(page, '.balance-hero__title')).toMatch(/font-size:\s*var\(--display-2\)/)
    expect(page).not.toMatch(/@media|4\.25rem|1\.7rem/)
  })

  it('sets the one line under the answer in the serif at --text-lead, and gives the Details’ lines no size of their own', () => {
    const lead = ruleBody(page, '.balance-hero__lede')
    expect(lead).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(lead).toMatch(/font-size:\s*var\(--text-lead\)/)
    // The target and the caveats are lines of the Details (RowList.css), not lead lines under the answer.
    expect(page).not.toMatch(/\.balance-hero__line/)
  })

  it('stacks the answer, the triangle and the share button in one column, the stack gap apart', () => {
    expect(page).toMatch(
      /\.balance-hero__pair \{[^}]*display:\s*grid;[^}]*gap:\s*var\(--stack-gap\)/,
    )
    expect(page).not.toMatch(/balance-hero__gap|balance-hero__figure|balance-hero__number/)
    expect(page).not.toMatch(/\.balance-hero--answer \{[^}]*grid-template-columns/)
  })

  it('has no eyebrow, highlight or underline on the sport word', () => {
    expect(page).not.toMatch(/eyebrow|balance-hero__sport|linear-gradient/)
  })

  it('leaves the headline’s focus to the base rule, which underlines no page title', () => {
    expect(page).not.toMatch(/focus-visible|text-decoration/)
  })

  it('keeps the answer’s lines to the reading measure, not a character count', () => {
    expect(page).not.toMatch(/\.balance-hero \{[^}]*max-width/)
    expect(page).toMatch(/\.balance-hero > p \{[^}]*max-width:\s*var\(--measure\);/)
    expect(page).not.toMatch(/\d+ch\b/)
  })
})
