import { describe, expect, it } from 'vitest'
import { SMALL_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './AthleteFields.css')

/** The stylesheet with comments removed and every run of whitespace made a single space. */
function flat(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
}

describe('AthleteFields: the sex options on a 320 px phone', () => {
  it('sets the option labels a step smaller at the small phone width, so "Prefer not to say" keeps two lines', () => {
    expect(css).toContain(`@media (max-width: ${SMALL_PHONE_MAX_WIDTH_PX}px)`)
    expect(flat(css)).toContain(
      `@media (max-width: ${SMALL_PHONE_MAX_WIDTH_PX}px) { .athlete-fields .segmented-control__option { font-size: var(--text-sm); } }`,
    )
  })
})
