import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'
import { PROFILE_PAIR_MIN_WIDTH_PX } from '../layoutBreakpoints'

const css = await readStylesheet(import.meta.url, './ProfilePage.css')
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
const segmented = await readStylesheet(import.meta.url, '../components/SegmentedControl.css')

describe('ProfilePage stylesheet', () => {
  it('sets About you and Body and bike in two columns from the named width, and stacks them below that', () => {
    const query = new RegExp(
      `@media \\(min-width: ${PROFILE_PAIR_MIN_WIDTH_PX}px\\) \\{([\\s\\S]*?)\\n\\}`,
    )
    const wide = query.exec(bare)?.[1] ?? ''
    expect(wide).toMatch(
      /\.profile-pair \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    )
    expect(bare).toMatch(/\.profile-pair \{[^}]*display:\s*grid;/)
  })

  it('aligns the two sections to their tops, so a shorter one does not stretch the other', () => {
    expect(bare).toMatch(/\.profile-pair \{[^}]*align-items:\s*start;/)
  })

  it('reserves one line for the status, so a save that adds text does not move the fields', () => {
    expect(bare).toMatch(/\.profile-save \{[^}]*min-height:\s*1lh;/)
  })

  it('gives the status line no margin of its own, so the line is the only space it adds', () => {
    expect(bare).toMatch(/\.profile-save \{[^}]*margin:\s*0;/)
  })

  it('balances the lines of a unit or sex option label, so a short last word does not sit alone', () => {
    expect(ruleBody(segmented, '.segmented-control__option span')).toMatch(/text-wrap:\s*balance;/)
  })

  it('holds the Profile sections prose to 68 characters', () => {
    expect(bare).toMatch(/\.profile-page \.section > p \{[^}]*max-width:\s*68ch;/)
  })

  it('outlines Remove all my activities in the critical colour, leaving the filled button to the confirmation', () => {
    const remove = /\.btn\.profile-remove \{([^}]*)\}/.exec(bare)?.[1] ?? ''
    expect(remove).toMatch(/border-color:\s*var\(--status-critical\);/)
    expect(remove).toMatch(/color:\s*var\(--status-critical\);/)
    expect(remove).not.toMatch(/background:\s*var\(--status-critical\)/)
  })

  it('keeps the critical outline on hover, where the generic button hover would take it back to grey', () => {
    const hover = /\.btn\.profile-remove:hover \{([^}]*)\}/.exec(bare)?.[1] ?? ''
    expect(hover).toMatch(/border-color:\s*var\(--status-critical\);/)
  })
})
