import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { deltaE2000 } from './colourDistance'
import { colour, declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const THEMES = [
  ['light', resolved(lightRaw)],
  ['dark', resolved(new Map([...lightRaw, ...darkRaw]))],
] as const

const CHANNELS = ['pace', 'power', 'heartrate', 'cadence', 'elevation'] as const
const SPORTS = ['run', 'ride', 'swim'] as const

/** Two colours this far apart (CIEDE2000) are plainly two colours; 2 is the least an eye sees. */
const DISTINCT = 15
const GRAPHIC = 3

describe('activity channel colours', () => {
  it.each(THEMES)('%s: each channel reaches 3:1 on the card', (_theme, tokens) => {
    for (const channel of CHANNELS) {
      expect(
        contrast(colour(tokens, `ch-${channel}`), colour(tokens, 'surface-1')),
        channel,
      ).toBeGreaterThanOrEqual(GRAPHIC)
    }
  })

  it.each(THEMES)(
    '%s: channels differ from each other and from the sport hues',
    (_theme, tokens) => {
      const named = [
        ...CHANNELS.map((name) => [name, colour(tokens, `ch-${name}`)] as const),
        ...SPORTS.map((name) => [name, colour(tokens, `series-${name}`)] as const),
      ]
      for (const [index, [first, a]] of named.entries()) {
        for (const [second, b] of named.slice(index + 1)) {
          // Only pairs with a channel in them: the sport hues are checked against each other elsewhere.
          if (SPORTS.some((sport) => sport === first) && SPORTS.some((sport) => sport === second))
            continue
          expect(deltaE2000(a, b), `${first} and ${second}`).toBeGreaterThanOrEqual(DISTINCT)
        }
      }
    },
  )

  it('gives each channel a translucent fill in both themes', () => {
    for (const [, tokens] of THEMES) {
      for (const channel of CHANNELS) {
        expect(tokens.get(`ch-${channel}-soft`), channel).toMatch(/^#[0-9a-f]{8}$/)
      }
    }
  })
})
