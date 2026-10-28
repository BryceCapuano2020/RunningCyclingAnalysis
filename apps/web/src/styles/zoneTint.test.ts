import { describe, expect, it } from 'vitest'
import { MIN_ZONE_TINT } from '../ui/charts/ZoneTimeChart'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'
import type { Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const schemes: [string, Tokens][] = [
  ['light', resolved(lightRaw)],
  ['dark', resolved(new Map([...lightRaw, ...darkRaw]))],
]

/** `color-mix(in srgb, over percent, under)` of two opaque #rrggbb colours, as the browser rounds it. */
function mix(over: string, percent: number, under: string): string {
  const channels = [1, 3, 5].map((start) => {
    const top = parseInt(over.slice(start, start + 2), 16)
    const below = parseInt(under.slice(start, start + 2), 16)
    return Math.round((top * percent) / 100 + (below * (100 - percent)) / 100)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

/** The least contrast a graphic that carries meaning reaches against what it sits on. */
const GRAPHIC = 3

describe('the lightest zone segment', () => {
  for (const [name, tokens] of schemes) {
    for (const sport of ['run', 'ride']) {
      it(`keeps ${GRAPHIC}:1 against the card and the page in ${name} for ${sport}`, () => {
        const segment = mix(
          colour(tokens, `series-${sport}`),
          MIN_ZONE_TINT,
          colour(tokens, 'surface-1'),
        )
        expect(contrast(segment, colour(tokens, 'surface-1'))).toBeGreaterThanOrEqual(GRAPHIC)
        expect(contrast(segment, colour(tokens, 'surface-0'))).toBeGreaterThanOrEqual(GRAPHIC)
      })
    }
  }
})
