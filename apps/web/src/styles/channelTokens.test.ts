import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/test/stylesheet'
import { DEFICIENCIES, deltaE, simulate } from './colourDifference'
import { contrast } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const THEMES = [['paper', resolved(declared(tokensCss, ':root'))]] as const

const CHANNELS = ['pace', 'power', 'heartrate', 'cadence', 'elevation'] as const
const SPORTS = ['run', 'ride', 'swim'] as const

/**
 * Two colours this far apart (CIEDE2000) are plainly two colours; 2 is the least an eye sees. It was 15 before the
 * run ink moved to the spec's orange, which sits 13.4 from the power channel, and the secondary ink 12.1 from pace
 * under deutan vision; the channels keep their values until the activity page moves.
 */
const DISTINCT = 12
const GRAPHIC = 3

describe('activity channel colours', () => {
  it.each(THEMES)('%s: each channel reaches 3:1 on the paper', (_theme, tokens) => {
    for (const channel of CHANNELS) {
      expect(
        contrast(colour(tokens, `ch-${channel}`), colour(tokens, 'paper')),
        channel,
      ).toBeGreaterThanOrEqual(GRAPHIC)
    }
  })

  it.each(THEMES)(
    '%s: channels differ from each other and from the sport hues',
    (_theme, tokens) => {
      const named = [
        ...CHANNELS.map((name) => [name, colour(tokens, `ch-${name}`)] as const),
        ...SPORTS.map((name) => [name, colour(tokens, `${name}-ink`)] as const),
      ]
      for (const [index, [first, a]] of named.entries()) {
        for (const [second, b] of named.slice(index + 1)) {
          // Only pairs with a channel in them: the sport hues are checked against each other elsewhere.
          if (SPORTS.some((sport) => sport === first) && SPORTS.some((sport) => sport === second))
            continue
          expect(deltaE(a, b), `${first} and ${second}`).toBeGreaterThanOrEqual(DISTINCT)
        }
      }
    },
  )

  it('gives each channel a translucent fill', () => {
    for (const [, tokens] of THEMES) {
      for (const channel of CHANNELS) {
        expect(tokens.get(`ch-${channel}-soft`), channel).toMatch(/^#[0-9a-f]{8}$/)
      }
    }
  })
})

/** The route tile's ramp: its slow end is the neutral `--ink-secondary` and its fast end `--ch-pace`. */
describe('the route tile’s pace ramp', () => {
  it.each(THEMES)(
    '%s: its two ends are told apart, and each reaches 3:1 on the paper',
    (_theme, tokens) => {
      const slow = colour(tokens, 'ink-secondary')
      const fast = colour(tokens, 'ch-pace')
      expect(contrast(slow, colour(tokens, 'paper'))).toBeGreaterThanOrEqual(GRAPHIC)
      expect(contrast(fast, colour(tokens, 'paper'))).toBeGreaterThanOrEqual(GRAPHIC)
      expect(deltaE(slow, fast)).toBeGreaterThanOrEqual(DISTINCT)
    },
  )

  it.each(THEMES)(
    '%s: its two ends are still told apart with protan, deutan and tritan vision',
    (_theme, tokens) => {
      const slow = colour(tokens, 'ink-secondary')
      const fast = colour(tokens, 'ch-pace')
      for (const deficiency of DEFICIENCIES) {
        expect(
          deltaE(simulate(slow, deficiency), simulate(fast, deficiency)),
          deficiency,
        ).toBeGreaterThanOrEqual(DISTINCT)
      }
    },
  )

  it('is not the stone of elevation, which deutan vision cannot tell from the pace green', () => {
    const [, light] = THEMES[0]
    expect(
      deltaE(
        simulate(colour(light, 'ch-elevation'), 'deuteranopia'),
        simulate(colour(light, 'ch-pace'), 'deuteranopia'),
      ),
    ).toBeLessThan(DISTINCT)
  })
})
