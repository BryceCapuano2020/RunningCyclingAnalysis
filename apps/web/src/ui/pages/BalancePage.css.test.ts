import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const page = await readStylesheet(import.meta.url, './BalancePage.css')
const meter = await readStylesheet(import.meta.url, '../components/BalanceMeter.css')
const levels = await readStylesheet(import.meta.url, './BalanceLevels.css')

describe('Balance page stylesheet', () => {
  it('sets the answer in the serif at --display-2 at every width, with no size of its own on a phone', () => {
    expect(ruleBody(page, '.balance-hero__title')).toMatch(/font-size:\s*var\(--display-2\)/)
    expect(page).not.toMatch(/@media|4\.25rem|1\.7rem/)
  })

  it('sets the lead lines in the serif at --text-lead, and the lines after the first in the secondary ink', () => {
    const lead = ruleBody(page, '.balance-hero__lede,\n.balance-hero__line')
    expect(lead).toMatch(/font-family:\s*var\(--font-serif\)/)
    expect(lead).toMatch(/font-size:\s*var\(--text-lead\)/)
    expect(ruleBody(page, '.balance-hero__line')).toMatch(/color:\s*var\(--ink-secondary\)/)
  })

  it('stacks the answer, the meter, the levels and the share button in one column, the stack gap apart', () => {
    expect(page).toMatch(
      /\.balance-hero__pair \{[^}]*display:\s*grid;[^}]*gap:\s*var\(--stack-gap\)/,
    )
    expect(page).not.toMatch(/balance-hero__gap|balance-hero__figure|balance-hero__number/)
    expect(page).not.toMatch(/\.balance-hero--answer \{[^}]*grid-template-columns/)
  })

  it('has no eyebrow, highlight or underline on the sport word', () => {
    expect(page).not.toMatch(/eyebrow|balance-hero__sport|linear-gradient/)
  })

  it('draws the levels as one wrapping line, with no icon or column grid', () => {
    expect(ruleBody(levels, '.balance-levels__list')).toMatch(/flex-wrap:\s*wrap/)
    expect(levels).not.toMatch(/glyph|grid-template-columns|border-top/)
    expect(ruleBody(meter, '.balance-meter__number')).toMatch(/font-size:\s*var\(--title\)/)
  })

  it('draws no underline under the headline focused on arrival', () => {
    expect(page).toMatch(
      /\.balance-hero__title\[tabindex='-1'\]:focus-visible \{[^}]*text-decoration:\s*none/,
    )
  })

  it('keeps the answer’s lines to the reading measure, not a character count', () => {
    expect(page).not.toMatch(/\.balance-hero \{[^}]*max-width/)
    expect(page).toMatch(/\.balance-hero > p \{[^}]*max-width:\s*var\(--measure\);/)
    expect(page).not.toMatch(/\d+ch\b/)
  })
})
