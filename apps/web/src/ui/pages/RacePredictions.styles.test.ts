import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './RacePredictions.css')

describe('race bars', () => {
  it('keeps room either side of the bar for the spread’s two ends, so they print outside its caps', () => {
    expect(ruleBody(css, '.race-bar')).toMatch(/margin:\s*0 4\.25rem/)
    expect(ruleBody(css, '.race-bar__end--low')).toMatch(/translate\(-100%, -50%\)/)
  })

  it('sets the bar under the name and the time at every width, so the name’s meta line has the row’s width', () => {
    expect(ruleBody(css, '.race-row')).toMatch(/'index name time'\s*'\. bar bar'/)
    expect(css).not.toMatch(/'index name bar time'/)
  })

  it('lets the table in the disclosure scroll rather than widen the page', () => {
    expect(ruleBody(css, '.race-table th,\n.race-table td')).toMatch(/vertical-align:\s*top/)
  })

  it('wraps the column heads, so the last column fits a 1440 px page where the table sits in half the width', () => {
    expect(ruleBody(css, '.race-table thead th')).toMatch(/white-space:\s*normal/)
  })
})
