import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'
import { BALANCE_PHONE_MAX_WIDTH_PX, HEADLINE_SMALL_MAX_WIDTH_PX } from '../layoutBreakpoints'

const page = await readStylesheet(import.meta.url, './BalancePage.css')
const meter = await readStylesheet(import.meta.url, '../components/BalanceMeter.css')
const levels = await readStylesheet(import.meta.url, './BalanceLevels.css')

describe('Balance page stylesheet', () => {
  it('sets the headline a step smaller at the width named in layoutBreakpoints.ts, and names that constant beside it', () => {
    expect(page).toContain(`@media (max-width: ${HEADLINE_SMALL_MAX_WIDTH_PX}px)`)
    expect(page).toContain('HEADLINE_SMALL_MAX_WIDTH_PX')
    expect(page).toContain('layoutBreakpoints.ts')
  })

  it('sets the headline at 1.7rem in that width, so at 130% text it still takes two lines and LEANS is not left alone', () => {
    const small = mediaBlock(page, `(max-width: ${HEADLINE_SMALL_MAX_WIDTH_PX}px)`)
    expect(small).toMatch(/\.balance-hero__head h1 \{[^}]*font-size:\s*1\.7rem;/)
  })

  it('stacks the answer, the meter, the levels, the period control and the share button in one column', () => {
    expect(page).toMatch(/\.balance-hero__pair \{[^}]*display:\s*grid;[^}]*gap:\s*var\(--space-5\)/)
    expect(page).not.toMatch(/balance-hero__gap|balance-hero__figure|balance-hero__number/)
    expect(page).not.toMatch(/\.balance-hero--answer \{[^}]*grid-template-columns/)
  })

  it('drops the eyebrow on a phone, at the width named in layoutBreakpoints.ts, so the meter and levels reach the first screen', () => {
    const phone = mediaBlock(page, `(max-width: ${BALANCE_PHONE_MAX_WIDTH_PX}px)`)
    expect(page).toContain('BALANCE_PHONE_MAX_WIDTH_PX')
    expect(phone).toMatch(/\.balance-hero--answer \.eyebrow \{[^}]*display:\s*none/)
  })

  it('tightens the meter and the levels at the same width, so the phone layout changes at one place', () => {
    const query = `(max-width: ${BALANCE_PHONE_MAX_WIDTH_PX}px)`
    expect(mediaBlock(meter, query)).toMatch(/\.balance-meter__number/)
    expect(mediaBlock(levels, query)).toMatch(/\.balance-levels__list/)
  })

  it('keeps the grade column at least 3rem and lets it grow, so a grade of 100% or more never meets the level', () => {
    expect(ruleBody(levels, '.balance-levels__grade')).toMatch(/min-width:\s*3rem/)
    expect(ruleBody(levels, '.balance-levels__row')).toMatch(
      /grid-template-columns:\s*4\.75rem auto minmax\(0, auto\)/,
    )
  })

  it('draws no underline under a keyboard-focused headline, since the sport it names carries the only one', () => {
    expect(page).toMatch(
      /\.balance-hero__title\[tabindex='-1'\]:focus-visible \{[^}]*text-decoration:\s*none/,
    )
  })

  it('lifts the 62 character measure from the answer block, so the headline runs its full width, and keeps it on the lines under the headline', () => {
    expect(page).toMatch(/\.balance-hero \{[^}]*display:\s*grid;[^}]*\}/)
    expect(page).not.toMatch(/\.balance-hero \{[^}]*max-width/)
    expect(page).toMatch(/\.balance-hero > p \{[^}]*max-width:\s*62ch;/)
  })

  it('ends the step just below 360 px, so 360 px keeps the headline at its size', () => {
    expect(HEADLINE_SMALL_MAX_WIDTH_PX).toBe(359)
  })
})
