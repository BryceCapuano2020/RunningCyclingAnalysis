import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../ui/components/stylesheet'
import { contrast } from './contrastMath'
import { colour, declarations, declared, resolved, type Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const meterCss = await readStylesheet(import.meta.url, '../ui/components/BalanceMeter.css')

const paper: Tokens = resolved(declared(tokensCss, ':root'))

/** The least contrast a graphic reaches: a mark or a line, against what it sits on. */
const GRAPHIC = 3

/** The token a declaration names: `--ink` for `var(--ink)`. */
function tokenOf(value: string | undefined): string {
  const match = /var\(--([a-z0-9-]+)\)/.exec(value ?? '')
  if (match?.[1] === undefined) throw new Error(`no token in “${value}”`)
  return match[1]
}

/**
 * The meter's marks against the page they sit on, read from the stylesheet, so the test checks the colours the meter
 * paints: the one mark, the tick at Even and each end's upright in its sport's ink. The track is the hairline the system
 * names (docs/design/system.md, The Balance meter): the scale it draws is also written at its ends and under the mark.
 */
function meterPairs(tokens: Tokens): [string, string, string][] {
  const fill = (selector: string) =>
    colour(tokens, tokenOf(declarations(meterCss, selector).get('background')))
  const ends = declarations(meterCss, '.balance-meter__track::after')
  const page = colour(tokens, 'paper')
  return [
    ['the mark on the page', fill('.balance-meter__dot'), page],
    ['the tick at Even on the page', fill('.balance-meter__even'), page],
    ['the run end on the page', colour(tokens, tokenOf(ends.get('border-left'))), page],
    ['the ride end on the page', colour(tokens, tokenOf(ends.get('border-right'))), page],
  ]
}

describe('balance meter contrast', () => {
  it('the mark, the tick at Even and both ends reach 3:1 against the page', () => {
    for (const [label, fg, bg] of meterPairs(paper)) {
      expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(GRAPHIC)
    }
  })
})

describe('balance meter stylesheet', () => {
  it('draws the track as a 1 px hairline', () => {
    const line = declarations(meterCss, '.balance-meter__track::before')
    expect(line.get('height')).toBe('1px')
    expect(line.get('background')).toBe('var(--hairline)')
  })

  it('sets each end’s upright in its own sport’s ink', () => {
    const ends = declarations(meterCss, '.balance-meter__track::after')
    expect(ends.get('border-left')).toBe('1px solid var(--run-ink)')
    expect(ends.get('border-right')).toBe('1px solid var(--ride-ink)')
  })

  it('draws one ink mark, with no band, fill, ring or glow', () => {
    expect(ruleBody(meterCss, '.balance-meter__dot')).toMatch(/background:\s*var\(--ink\)/)
    expect(meterCss).not.toMatch(/balance-meter__band|box-shadow|radius-pill|-wash|-soft/)
    expect(meterCss).not.toMatch(/dashed|dotted|stroke-dasharray/)
  })

  it('names each end in its sport’s ink, in the meta face', () => {
    expect(ruleBody(meterCss, '.balance-meter__end')).toMatch(/color:\s*var\(--sport-ink\)/)
    expect(ruleBody(meterCss, '.balance-meter__ends')).toMatch(/font-family:\s*var\(--font-mono\)/)
  })
})
