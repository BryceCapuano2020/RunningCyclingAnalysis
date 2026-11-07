import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const seriesCss = await readStylesheet(import.meta.url, '../ui/charts/ChartSeries.css')
const paper = resolved(declared(tokensCss, ':root'))

describe('the faded marks', () => {
  it('have one fade on one theme, so no token scales it', () => {
    expect(paper.has('mark-fade')).toBe(false)
    expect(seriesCss).not.toMatch(/--mark-fade/)
  })
})
