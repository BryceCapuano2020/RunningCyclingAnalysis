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

  it('set the light dot at 40% and an aged dot at its own opacity', () => {
    expect(seriesCss).toMatch(/\.chart-series__marker--light \{[^}]*fill-opacity: 0\.4;/)
    expect(seriesCss).toMatch(
      /\.chart-series__marker--aged \{[^}]*fill-opacity: var\(--dot-opacity, 1\);/,
    )
  })
})
