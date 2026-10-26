import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './Methodology.css')

describe('methodology topics', () => {
  it('spaces the topics from the heading only inside the closed disclosure', () => {
    expect(ruleBody(css, '.methodology__sections')).not.toMatch(/margin-top/)
    expect(ruleBody(css, '.methodology__disclosure > .methodology__sections')).toMatch(
      /margin-top:\s*var\(--space-4\)/,
    )
  })
})
