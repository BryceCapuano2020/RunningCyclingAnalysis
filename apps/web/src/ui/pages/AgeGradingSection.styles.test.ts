import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './AgeGradingSection.css')

/** The finger's media block, from its opening rule to the brace that closes it at the start of a line. */
const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

describe('age grading links on a finger', () => {
  it('gives Change age and sex a control height on a coarse pointer', () => {
    expect(coarse).toMatch(/\.age-grading__link\b[^{]*\{[^}]*min-height:\s*var\(--control-height\)/)
  })

  it('gives the source link a control height on a coarse pointer', () => {
    expect(coarse).toMatch(
      /\.age-grading__source a\b[^{]*\{[^}]*min-height:\s*var\(--control-height\)/,
    )
  })
})
