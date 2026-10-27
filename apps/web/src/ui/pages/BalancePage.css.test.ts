import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { HEADLINE_SMALL_MAX_WIDTH_PX, SHORT_PHONE_MAX_HEIGHT_PX } from '../layoutBreakpoints'

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

  it('sets the headline at 1.7rem in that width, so at 130% text it still takes two lines and LEANS is not left alone', () => {
    const small = inMedia(page, `(max-width: ${HEADLINE_SMALL_MAX_WIDTH_PX}px)`)
    expect(small).toMatch(/\.balance-hero__head h1 \{[^}]*font-size:\s*1\.7rem;/)
  })

  it('sits the answer beside its meter in landscape on a short phone, so the meter is on the first screen', () => {
    const landscape = inMedia(
      page,
      `(orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px)`,
    )
    expect(landscape).toMatch(
      /\.balance-hero__pair \{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    )
  })

  it('tightens the gap between the answer and its meter on a short phone held upright, so the key ends above the fold at 320 x 640', () => {
    const short = inMedia(page, `(max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px)`)
    expect(short).toMatch(/\.balance-hero__pair \{[^}]*gap:\s*var\(--space-4\);/)
  })

  it('ends the step just below 360 px, so 360 px keeps the headline at its size', () => {
    expect(HEADLINE_SMALL_MAX_WIDTH_PX).toBe(359)
  })
})
