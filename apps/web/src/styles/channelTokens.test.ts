import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { CVD_KINDS, deltaE2000, simulateCvd } from './colourDistance'
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

/** The route tile's ramp: its slow end is the neutral `--text-secondary` and its fast end `--ch-pace`. */
describe('the route tile’s pace ramp', () => {
  it.each(THEMES)(
    '%s: its two ends are told apart, and each reaches 3:1 on the card',
    (_theme, tokens) => {
      const slow = colour(tokens, 'text-secondary')
      const fast = colour(tokens, 'ch-pace')
      expect(contrast(slow, colour(tokens, 'surface-1'))).toBeGreaterThanOrEqual(GRAPHIC)
      expect(contrast(fast, colour(tokens, 'surface-1'))).toBeGreaterThanOrEqual(GRAPHIC)
      expect(deltaE2000(slow, fast)).toBeGreaterThanOrEqual(DISTINCT)
    },
  )

  it.each(THEMES)(
    '%s: its two ends are still told apart with protan, deutan and tritan vision',
    (_theme, tokens) => {
      const slow = colour(tokens, 'text-secondary')
      const fast = colour(tokens, 'ch-pace')
      for (const kind of CVD_KINDS) {
        expect(
          deltaE2000(simulateCvd(slow, kind), simulateCvd(fast, kind)),
          kind,
        ).toBeGreaterThanOrEqual(DISTINCT)
      }
    },
  )

  it('is not the stone of elevation, which deutan vision cannot tell from the pace green', () => {
    const [, light] = THEMES[0]
    expect(
      deltaE2000(
        simulateCvd(colour(light, 'ch-elevation'), 'deutan'),
        simulateCvd(colour(light, 'ch-pace'), 'deutan'),
      ),
    ).toBeLessThan(DISTINCT)
  })
})
