import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './RacePredictions.css')

describe('race bars', () => {
  it('keeps room either side of the bar for the spread’s two ends, so they print outside its caps', () => {
    expect(ruleBody(css, '.race-bar')).toMatch(/margin:\s*0 4\.25rem/)
    expect(ruleBody(css, '.race-bar__end--low')).toMatch(/translate\(-100%, -50%\)/)
  })

  it('drops the bar under the name and the time below a desktop, so it keeps a 320 px phone’s width', () => {
    expect(ruleBody(css, '.race-row')).toMatch(/'bar bar'/)
    expect(css).toMatch(/@media \(min-width: 761px\) \{\s*\.race-row \{[^}]*'name bar time'/)
  })

  it('lets the table in the disclosure scroll rather than widen the page', () => {
    expect(ruleBody(css, '.race-table th,\n.race-table td')).toMatch(/vertical-align:\s*top/)
  })
})
