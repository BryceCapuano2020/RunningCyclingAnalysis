import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { colour, declarations, declared, resolved, type Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const meterCss = await readStylesheet(import.meta.url, '../ui/components/BalanceMeter.css')

const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const light: Tokens = resolved(lightRaw)
const dark: Tokens = resolved(new Map([...lightRaw, ...darkRaw]))

/** The least contrast a graphic reaches: a mark, an edge or a fill, against what it sits on. */
const GRAPHIC = 3

/** The token a declaration names: `--surface-2` for `var(--surface-2)`. */
function tokenOf(value: string | undefined): string {
  const match = /var\(--([a-z0-9-]+)\)/.exec(value ?? '')
  if (match?.[1] === undefined) throw new Error(`no token in “${value}”`)
  return match[1]
}

/**
 * The balance meter's marks against what they sit on. The track's fill, its edge and the even line
 * are read from the stylesheet, so the test checks the colours the meter actually paints; the band
 * and dot take the sport colours.
 */
function meterPairs(tokens: Tokens): [string, string, string][] {
  const track = colour(
    tokens,
    tokenOf(declarations(meterCss, '.balance-meter__track').get('background')),
  )
  const edge = colour(
    tokens,
    tokenOf(declarations(meterCss, '.balance-meter__track').get('border')),
  )
  const even = colour(
    tokens,
    tokenOf(declarations(meterCss, '.balance-meter__even').get('background')),
  )
  const page = colour(tokens, 'surface-0')
  return [
    ['track edge on the page', edge, page],
    ['even line on the track', even, track],
    ['run band edge on the track', colour(tokens, 'series-run'), track],
    ['ride band edge on the track', colour(tokens, 'series-ride'), track],
    ['even band edge on the track', colour(tokens, 'neutral-mark'), track],
    ['run dot on the track', colour(tokens, 'series-run'), track],
    ['ride dot on the track', colour(tokens, 'series-ride'), track],
    ['even dot on the track', colour(tokens, 'neutral-mark'), track],
  ]
}

describe('balance meter contrast', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '%s: the track, band and dot reach 3:1 against what they sit on',
    (_theme, tokens) => {
      for (const [label, fg, bg] of meterPairs(tokens)) {
        expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(GRAPHIC)
      }
    },
  )
})

describe('balance meter stylesheet', () => {
  it('edges the track in control-border, so the track reads against the page', () => {
    expect(declarations(meterCss, '.balance-meter__track').get('border')).toBe(
      '1px solid var(--control-border)',
    )
  })

  it.each([
    ['run', 'series-run'],
    ['ride', 'series-ride'],
  ] as const)('edges the %s band and fills its dot in the sport colour', (sport, token) => {
    expect(
      declarations(meterCss, `.balance-meter--${sport} .balance-meter__band`).get('border-color'),
    ).toBe(`var(--${token})`)
    expect(
      declarations(meterCss, `.balance-meter--${sport} .balance-meter__dot`).get('background'),
    ).toBe(`var(--${token})`)
  })
})
