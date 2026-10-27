import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet } from '../components/stylesheet'
import {
  HEADLINE_SMALL_MAX_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SHORT_PHONE_MAX_HEIGHT_PX,
} from '../layoutBreakpoints'

const page = await readStylesheet(import.meta.url, './BalancePage.css')

/** The short-phone query as BalancePage.css writes it: short, and a finger or a phone-width window. */
const SHORT_PHONE = `(max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`
/** The same, held sideways. */
const SHORT_LANDSCAPE = `(orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`

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

  it('sits the answer beside its meter in landscape on a short phone, so the meter is on the first screen', () => {
    expect(mediaBlock(page, SHORT_LANDSCAPE)).toMatch(
      /\.balance-hero__pair \{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    )
  })

  it('tightens the gap between the answer and its meter on a short phone held upright, so the key clears the section tabs at 320 x 640', () => {
    expect(mediaBlock(page, SHORT_PHONE)).toMatch(
      /\.balance-hero__pair \{[^}]*gap:\s*var\(--space-4\);/,
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
