import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './RacePredictions.css')

describe('race table', () => {
  it('lets the lines under a predicted time wrap, since a table cell does not and the two estimates run past 320 px', () => {
    expect(ruleBody(css, '.race-table__sub')).toMatch(/white-space:\s*normal/)
  })
})
