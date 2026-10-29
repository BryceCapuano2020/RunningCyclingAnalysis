import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet } from '../components/stylesheet'
import {
  BALANCE_PHONE_MAX_WIDTH_PX,
  HEADLINE_SMALL_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
} from '../layoutBreakpoints'

const page = await readStylesheet(import.meta.url, './BalancePage.css')

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

  it('sets the answer beside its gap figure on a wide screen, and the figure under it on a phone', () => {
    expect(page).toMatch(
      /\.balance-hero--answer \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/,
    )
    expect(mediaBlock(page, `(max-width: ${PHONE_MAX_WIDTH_PX}px)`)).toMatch(
      /\.balance-hero--answer \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    )
  })

  it('makes the answer one compact block on a phone: the headline at 28 px with the figure beside it, no eyebrow, one clause', () => {
    const phone = mediaBlock(page, `(max-width: ${BALANCE_PHONE_MAX_WIDTH_PX}px)`)
    expect(page).toContain('BALANCE_PHONE_MAX_WIDTH_PX')
    expect(phone).toMatch(/\.balance-hero__title \{[^}]*font-size:\s*1\.75rem;/)
    expect(phone).toMatch(/grid-template-areas:\s*'title gap'\s*'lede lede'/)
    expect(phone).toMatch(
      /\.balance-hero--answer \.eyebrow,\s*\.balance-hero__range \{[^}]*display:\s*none/,
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
