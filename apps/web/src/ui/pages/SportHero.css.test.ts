import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './SportHero.css')

describe('Sport hero stylesheet', () => {
  it('sets the road standards link at the body size, as the other inline source links are', () => {
    expect(ruleBody(css, '.age-grade__standards')).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('gives the road standards link the control height on a coarse pointer, so a finger can tap it', () => {
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{\s*\.age-grade__standards \{[^}]*display:\s*inline-flex[^}]*min-height:\s*var\(--control-height\)/,
    )
  })

  it('sets the figure at a line height of 1 in forced colours, so its backplate stays off the chip above', () => {
    const forced = mediaBlock(css, '(forced-colors: active)')
    expect(forced).toMatch(/\.sport-hero__number \{\s*line-height:\s*1;/)
    expect(forced).toMatch(/\.sport-hero__level \{[^}]*line-height:\s*1;/)
  })
})
