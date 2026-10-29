import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { DEFICIENCIES, deltaE, simulate } from './colourDifference'
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

/** The least contrast a graphic that carries meaning reaches against what it sits on. */
const GRAPHIC = 3
/** The least contrast of the text inside a step. */
const TEXT = 4.5
/** The least CIEDE2000 between neighbouring steps, to a reader with normal colour vision and with each deficiency. */
const NEIGHBOUR = 7
const STEPS = [1, 2, 3, 4, 5] as const
const SPORTS = ['run', 'ride'] as const

const ramp = (tokens: Tokens, sport: string) =>
  STEPS.map((step) => colour(tokens, `zone-${sport}-${step}`))
const inkOf = (tokens: Tokens, step: number) => colour(tokens, `zone-ink-${step}`)

describe('the zone ramp', () => {
  for (const [name, tokens] of schemes) {
    for (const sport of SPORTS) {
      const steps = ramp(tokens, sport)

      it(`keeps ${GRAPHIC}:1 against the card and the page in ${name} for every ${sport} step`, () => {
        for (const step of steps) {
          expect(contrast(step, colour(tokens, 'surface-1'))).toBeGreaterThanOrEqual(GRAPHIC)
          expect(contrast(step, colour(tokens, 'surface-0'))).toBeGreaterThanOrEqual(GRAPHIC)
        }
      })

      it(`keeps ${TEXT}:1 for the text inside each ${sport} step in ${name}`, () => {
        steps.forEach((step, i) => {
          expect(contrast(inkOf(tokens, i + 1), step), `zone ${i + 1}`).toBeGreaterThanOrEqual(TEXT)
        })
      })

      it(`keeps neighbouring ${sport} steps ${NEIGHBOUR} apart in ${name}, for every colour vision`, () => {
        for (let i = 1; i < steps.length; i += 1) {
          const [before, after] = [steps[i - 1]!, steps[i]!]
          expect(deltaE(before, after), `${i} to ${i + 1}`).toBeGreaterThanOrEqual(NEIGHBOUR)
          for (const deficiency of DEFICIENCIES) {
            expect(
              deltaE(simulate(before, deficiency), simulate(after, deficiency)),
              `${i} to ${i + 1} as ${deficiency}`,
            ).toBeGreaterThanOrEqual(NEIGHBOUR)
          }
        }
      })

      it(`orders the ${sport} steps by effort in ${name}: darker with effort in light, lighter in dark`, () => {
        const against = steps.map((step) => contrast(step, '#000000'))
        const sorted = [...against].sort((a, b) => (name === 'light' ? b - a : a - b))
        expect(against).toEqual(sorted)
      })
    }
  }

  it('is the same ramp the sport blocks alias, for every step', () => {
    for (const sport of SPORTS) {
      const block = tokensCss.slice(tokensCss.indexOf(`[data-sport='${sport}'] {`))
      for (const step of STEPS) {
        expect(block).toContain(`--zone-${step}: var(--zone-${sport}-${step});`)
      }
    }
  })
})
