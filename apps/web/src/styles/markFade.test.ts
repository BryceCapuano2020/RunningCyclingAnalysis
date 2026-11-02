import { describe, expect, it } from 'vitest'
import { OLDEST_OPACITY } from '../ui/charts/bestsOverTime'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast, over } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'
import type { Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const seriesCss = await readStylesheet(import.meta.url, '../ui/charts/ChartSeries.css')
const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const schemes: [string, Tokens][] = [
  ['light', resolved(lightRaw)],
  ['dark', resolved(new Map([...lightRaw, ...darkRaw]))],
]

/** The least contrast a graphic that carries meaning reaches against what it sits on. */
const GRAPHIC = 3

/** The share of its tint a faded mark keeps, from the --mark-fade a scheme sets: 1 is the fade as drawn. */
const fadeOf = (tokens: Tokens) => Number(tokens.get('mark-fade'))

/** The opacity a mark of opacity `drawn` is painted at, once the scheme's fade is applied: the stylesheet's calc. */
const painted = (drawn: number, fade: number) => 1 - (1 - drawn) * fade

/** The base opacity of the light dot, read from the stylesheet's own calc so the test follows it. */
const lightDot = (() => {
  const rule = seriesCss.match(
    /\.chart-series__marker--light \{[^}]*fill-opacity: calc\(1 - ([\d.]+) \*/,
  )
  return 1 - Number(rule?.[1])
})()

describe('the faded marks', () => {
  it('keep all of their fade in light and a third of it in dark', () => {
    const [light, dark] = schemes
    expect(fadeOf(light![1])).toBe(1)
    expect(fadeOf(dark![1])).toBeLessThan(0.5)
  })

  it('read the fade from the scheme, for the light dot and for a dot whose age is its opacity', () => {
    expect(seriesCss).toMatch(/\.chart-series__marker--light \{[^}]*var\(--mark-fade, 1\)/)
    expect(seriesCss).toMatch(
      /\.chart-series__marker--aged \{[^}]*1 - var\(--dot-opacity, 1\)[^}]*var\(--mark-fade, 1\)/,
    )
  })

  for (const sport of ['run', 'ride']) {
    it(`keeps the light dot and the oldest best ${GRAPHIC}:1 against the card in dark for ${sport}`, () => {
      const tokens = schemes[1]![1]
      const mark = colour(tokens, `series-${sport}`)
      const card = colour(tokens, 'surface-1')
      for (const [what, drawn] of [
        ['the light dot', lightDot],
        ['the oldest best', OLDEST_OPACITY],
      ] as const) {
        const alpha = Math.round(painted(drawn, fadeOf(tokens)) * 255)
          .toString(16)
          .padStart(2, '0')
        expect(contrast(over(`${mark}${alpha}`, card), card), what).toBeGreaterThanOrEqual(GRAPHIC)
      }
    })
  }

  it('is the check the dark scheme needs: at the light scheme’s fade, a dark ride dot is under it', () => {
    const [, dark] = schemes
    const mark = colour(dark![1], 'series-ride')
    const card = colour(dark![1], 'surface-1')
    const alpha = Math.round(lightDot * 255)
      .toString(16)
      .padStart(2, '0')
    expect(contrast(over(`${mark}${alpha}`, card), card)).toBeLessThan(GRAPHIC)
  })
})
