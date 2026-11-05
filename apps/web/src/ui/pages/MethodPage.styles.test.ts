import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './MethodPage.css')

/** The rules inside a media query, up to the brace that closes it at the start of a line. */
function mediaBody(query: string): string {
  const escaped = query.replace(/[()]/g, '\\$&')
  return new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''
}

describe('method answer', () => {
  it('spaces the answer and its Details 12 px apart', () => {
    expect(ruleBody(css, '.method__answer')).toMatch(/gap:\s*var\(--space-3\)/)
  })

  it('keeps each line’s text beside its label from 561 px, one pixel above the compact phone width', () => {
    const wide = mediaBody('(min-width: 561px)')
    expect(wide).toMatch(/\.method__answer li > span \{[^}]*flex:\s*1 1 0/)
    expect(wide).toMatch(/\.method__answer li > span \{[^}]*min-width:\s*0/)
  })

  it('sets each label in the mono metadata face, with no fill or edge', () => {
    const rule = ruleBody(css, '.method__answer button.method__chip')
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/)
    expect(rule).toMatch(/background:\s*none/)
    expect(rule).toMatch(/border:\s*0/)
  })

  it('rules the three lines between hairlines', () => {
    expect(ruleBody(css, '.method__answer li')).toMatch(/border-top:\s*1px solid var\(--hairline\)/)
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
      /color:\s*var\(--ink-secondary\)/,
    )
  })
})

describe('method paragraphs', () => {
  it('holds the paragraphs of each section to the reading measure', () => {
    expect(ruleBody(css, '.method > .section > p')).toMatch(/max-width:\s*var\(--measure\)/)
  })
})
