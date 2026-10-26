import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './MethodPage.css')

/** The rules inside a media query, up to the brace that closes it at the start of a line. */
function mediaBody(query: string): string {
  const escaped = query.replace(/[()]/g, '\\$&')
  return new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''
}

describe('method answer', () => {
  it('spaces the three lines 16 px apart', () => {
    expect(ruleBody(css, '.method__answer')).toMatch(/gap:\s*var\(--space-4\)/)
  })

  it('keeps each line’s text beside its chip from 561 px, one pixel above the compact phone width', () => {
    const wide = mediaBody('(min-width: 561px)')
    expect(wide).toMatch(/\.method__answer li > span \{[^}]*flex:\s*1 1 0/)
    expect(wide).toMatch(/\.method__answer li > span \{[^}]*min-width:\s*0/)
  })

  it('leaves the chip button in the chip face, not the body face', () => {
    expect(ruleBody(css, '.method__answer button.method__chip')).not.toMatch(/font-family/)
  })
})

describe('method contents', () => {
  it('thickens a contents button’s underline on hover, as a link’s does', () => {
    expect(ruleBody(css, '.method__contents button:hover')).toMatch(
      /text-decoration-thickness:\s*2px/,
    )
  })

  it('draws a pressed contents button in the secondary ink', () => {
    expect(ruleBody(css, '.method__contents button:active')).toMatch(
      /color:\s*var\(--text-secondary\)/,
    )
  })
})

describe('method paragraphs', () => {
  it('holds the paragraphs of each section to a 68 character measure', () => {
    expect(ruleBody(css, '.method > .section > p')).toMatch(/max-width:\s*68ch/)
  })
})
