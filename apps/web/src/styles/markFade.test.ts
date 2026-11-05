import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const seriesCss = await readStylesheet(import.meta.url, '../ui/charts/ChartSeries.css')
const paper = resolved(declared(tokensCss, ':root'))

describe('the faded marks', () => {
  it('keep all of their fade on paper: --mark-fade is 1', () => {
    expect(Number(paper.get('mark-fade'))).toBe(1)
  })

  it('read the fade from the token, for the light dot and for a dot whose age is its opacity', () => {
    expect(seriesCss).toMatch(/\.chart-series__marker--light \{[^}]*var\(--mark-fade, 1\)/)
    expect(seriesCss).toMatch(
      /\.chart-series__marker--aged \{[^}]*1 - var\(--dot-opacity, 1\)[^}]*var\(--mark-fade, 1\)/,
    )
  })
})
