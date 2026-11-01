import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './CheckInRow.css')

describe('CheckInRow stylesheet', () => {
  it('hides the summary’s sentence from the eye while the row is open, since the panel gives it whole', () => {
    const open = ruleBody(css, '.checkin-row__details[open] .checkin-row__line')
    expect(open).toMatch(/position:\s*absolute/)
    expect(open).toMatch(/clip-path:\s*inset\(50%\)/)
    expect(open).not.toMatch(/display:\s*none/)
  })

  it('keeps the chevron at the end of the summary when the sentence is out of the flow', () => {
    expect(ruleBody(css, '.checkin-row__toggle')).toMatch(/margin-left:\s*auto/)
  })
})
