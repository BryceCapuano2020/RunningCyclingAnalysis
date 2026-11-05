import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SettingsOverTime.css')

describe('Settings over time rows', () => {
  it('sets a sport setting’s index in the sport ink, and any other in the neutral ink', () => {
    expect(ruleBody(css, '.settings-over-time__row[data-sport] .row__index')).toMatch(
      /color:\s*var\(--sport-ink\)/,
    )
    expect(ruleBody(css, '.settings-over-time__row .row__index')).toMatch(
      /color:\s*var\(--ink-secondary\)/,
    )
  })
})
