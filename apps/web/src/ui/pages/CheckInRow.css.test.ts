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

  it('is a plain disclosure: the base ▸, no box, chevron or fill', () => {
    expect(css).not.toMatch(/checkin-row__toggle|border:|background|border-radius/)
    expect(ruleBody(css, '.checkin-row__summary::-webkit-details-marker')).toMatch(
      /display:\s*none/,
    )
  })
})
