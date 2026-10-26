import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { PROFILE_PAIR_MIN_WIDTH_PX } from '../layoutBreakpoints'

const css = await readStylesheet(import.meta.url, './ProfilePage.css')
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')

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

  it('outlines Remove all my activities in the critical colour, leaving the filled button to the confirmation', () => {
    const remove = /\.btn\.profile-remove \{([^}]*)\}/.exec(bare)?.[1] ?? ''
    expect(remove).toMatch(/border-color:\s*var\(--status-critical\);/)
    expect(remove).toMatch(/color:\s*var\(--status-critical\);/)
    expect(remove).not.toMatch(/background:\s*var\(--status-critical\)/)
  })
})
