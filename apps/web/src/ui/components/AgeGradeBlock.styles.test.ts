import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './AgeGradeBlock.css')

describe('Age grade block stylesheet', () => {
  it('gives its one column the width it has, so a long grade line cannot widen the card', () => {
    expect(ruleBody(css, '.age-grade')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(ruleBody(css, '.age-grade')).toMatch(/min-width:\s*0/)
  })

  it('sets the effort in body size and the secondary colour, under the level line', () => {
    const effort = ruleBody(css, '.age-grade__effort')
    expect(effort).toMatch(/font-size:\s*var\(--text-md\)/)
    expect(effort).toMatch(/color:\s*var\(--text-secondary\)/)
  })

  it('sets the standards link at the body size, as the other inline source links are', () => {
    expect(ruleBody(css, '.age-grade__standards')).toMatch(/font-size:\s*var\(--text-md\)/)
  })

  it('gives the standards link the control height on a coarse pointer, so a finger can tap it', () => {
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{\s*\.age-grade__standards \{[^}]*display:\s*inline-flex[^}]*min-height:\s*var\(--control-height\)/,
    )
  })
})
