import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { colour, declarations, declared, resolved, type Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const meterCss = await readStylesheet(import.meta.url, '../ui/components/BalanceMeter.css')

const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const light: Tokens = resolved(lightRaw)
const dark: Tokens = resolved(new Map([...lightRaw, ...darkRaw]))

/** The least contrast a graphic reaches: a mark or a line, against what it sits on. */
const GRAPHIC = 3

/** The token a declaration names: `--control-border` for `var(--control-border)`. */
function tokenOf(value: string | undefined): string {
  const match = /var\(--([a-z0-9-]+)\)/.exec(value ?? '')
  if (match?.[1] === undefined) throw new Error(`no token in “${value}”`)
  return match[1]
}

/**
 * The balance meter's marks against the page they sit on. The line and the even mark are read from the
 * stylesheet, so the test checks the colours the meter actually paints; the dot takes the sport colours. The band
 * is a translucent tint behind the dot: the range it marks is also written under the dot, so it carries no
 * contrast of its own.
 */
function meterPairs(tokens: Tokens): [string, string, string][] {
  const line = colour(
    tokens,
    tokenOf(declarations(meterCss, '.balance-meter__track::before').get('background')),
  )
  const even = colour(
    tokens,
    tokenOf(declarations(meterCss, '.balance-meter__even').get('background')),
  )
  const page = colour(tokens, 'surface-0')
  return [
    ['line on the page', line, page],
    ['even mark on the page', even, page],
    ['run dot on the page', colour(tokens, 'series-run'), page],
    ['ride dot on the page', colour(tokens, 'series-ride'), page],
    ['even dot on the page', colour(tokens, 'neutral-mark'), page],
  ]
}

describe('balance meter contrast', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '%s: the line, the even mark and the dot reach 3:1 against the page',
    (_theme, tokens) => {
      for (const [label, fg, bg] of meterPairs(tokens)) {
        expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(GRAPHIC)
      }
    },
  )
})

describe('balance meter stylesheet', () => {
  it('draws the line at 3 px in control-border, so it reads against the page', () => {
    const line = declarations(meterCss, '.balance-meter__track::before')
    expect(line.get('height')).toBe('3px')
    expect(line.get('background')).toBe('var(--control-border)')
  })

  it.each([
    ['run', 'series-run'],
    ['ride', 'series-ride'],
  ] as const)('tints the %s band and fills its dot in the sport colour', (sport, token) => {
    expect(ruleBody(meterCss, `.balance-meter--${sport} .balance-meter__band`)).toMatch(
      new RegExp(`background:\\s*var\\(--${token}-soft\\)`),
    )
    expect(ruleBody(meterCss, `.balance-meter--${sport} .balance-meter__dot`)).toMatch(
      new RegExp(`background:\\s*var\\(--${token}\\)`),
    )
  })

  it('rings the dot in the page colour, so it stands clear of the line and the band', () => {
    expect(ruleBody(meterCss, '.balance-meter__dot')).toMatch(
      /box-shadow:\s*0 0 0 3px var\(--surface-0\)/,
    )
  })

  it('marks the range with a translucent band alone: no edge, no dashes', () => {
    const band = ruleBody(meterCss, '.balance-meter__band')
    expect(band).toMatch(/background:\s*var\(--neutral-band\)/)
    expect(band).not.toMatch(/border:|outline|box-shadow/)
    expect(meterCss).not.toMatch(/dashed|dotted|stroke-dasharray/)
  })
})
