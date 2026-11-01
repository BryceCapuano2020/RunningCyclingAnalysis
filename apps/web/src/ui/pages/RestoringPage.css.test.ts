import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './RestoringPage.css')

describe('RestoringPage stylesheet', () => {
  it('sets the held-out list a step apart from the actions above it', () => {
    expect(ruleBody(css, '.held-out')).toMatch(/margin-top:\s*var\(--space-6\)/)
  })
})
