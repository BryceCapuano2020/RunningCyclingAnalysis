import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { HEADLINE_SMALL_MAX_WIDTH_PX } from '../layoutBreakpoints'

const page = await readStylesheet(import.meta.url, './BalancePage.css')

/** The text of the @media block with this query, from its opening line to its closing brace. */
function inMedia(css: string, query: string): string {
  const start = css.indexOf(`@media ${query} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('\n}', start))
}

describe('Balance page stylesheet', () => {
  it('sets the headline a step smaller at the width named in layoutBreakpoints.ts, and names that constant beside it', () => {
    expect(page).toContain(`@media (max-width: ${HEADLINE_SMALL_MAX_WIDTH_PX}px)`)
    expect(page).toContain('HEADLINE_SMALL_MAX_WIDTH_PX')
    expect(page).toContain('layoutBreakpoints.ts')
  })

  it('sets the headline at 2rem in that width, and nowhere else', () => {
    const small = inMedia(page, `(max-width: ${HEADLINE_SMALL_MAX_WIDTH_PX}px)`)
    expect(small).toMatch(/\.balance-hero__head h1 \{[^}]*font-size:\s*2rem;/)
  })

  it('ends the step just below 360 px, so 360 px keeps the headline at its size', () => {
    expect(HEADLINE_SMALL_MAX_WIDTH_PX).toBe(359)
  })
})
