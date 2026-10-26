import { describe, expect, it } from 'vitest'
import { COMPACT_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './ImportNotice.css')

/** The stylesheet with comments removed and every run of whitespace made a single space. */
function flat(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
}

/** The declarations of the rule whose selector is exactly `selector`, from the flattened sheet. */
function bodyOf(source: string, selector: string): string {
  const pattern = new RegExp(`(?:^| )${selector.replace(/[.>]/g, '\\$&')} \\{([^{}]*)\\}`)
  return pattern.exec(flat(source))?.[1] ?? ''
}

describe('ImportNotice: the summary on a phone and a desktop', () => {
  it('gives "See your balance" the shared control height, as a flex item of the notice', () => {
    expect(bodyOf(css, '.import-notice > a')).toContain('min-height: var(--control-height);')
  })

  it('spaces the wrapped controls with a row gap below the compact phone width, named in layoutBreakpoints.ts', () => {
    expect(css).toContain(`@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
    expect(flat(css)).toContain(
      `@media (max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px) { .import-notice { row-gap: var(--space-3); } }`,
    )
    // A margin on Dismiss would sit it lower than "See your balance" when the two share a row.
    expect(flat(css)).not.toContain('.import-notice > .btn')
  })
})
