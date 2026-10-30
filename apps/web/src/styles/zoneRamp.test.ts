import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { DEFICIENCIES, deltaE, oklch, simulate } from './colourDifference'
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
/**
 * The least CIEDE2000 between neighbouring steps, to a reader with normal colour vision and with each
 * deficiency. Light darkens with effort, which gives it room. Dark has to keep every step saturated and
 * rising in luminance, never paling to pink or ice, so its steps sit closer; 5 is still plainly two colours,
 * and each step is also numbered.
 */
const NEIGHBOUR: Record<string, number> = { light: 7, dark: 5 }
/** Ride dark: the least chroma (OKLCH) of any step, and the lightest a step may be; effort never fades to pale. */
const DARK_MIN_CHROMA = 0.12
const DARK_MAX_LIGHTNESS = 0.8
/**
 * The run ramp runs from orange into umber and its chroma falls toward the strong end, so effort
 * deepens into earth and never into the status red. Steps 1 to 3 keep chroma 0.12 or more and steps 4
 * and 5 keep 0.07 or more, in both schemes; no step is paler than 0.90 lightness (OKLCH).
 */
const MIN_CHROMA = [0.12, 0.12, 0.12, 0.07, 0.07]
const MAX_LIGHTNESS = 0.9
/** The hues (OKLCH degrees) the run steps stay between: orange to umber. */
const HUE_BAND = [36, 60] as const
/** The least CIEDE2000 between any run step and the status red of its scheme. */
const FROM_CRITICAL = 10
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

      it(`keeps neighbouring ${sport} steps ${NEIGHBOUR[name]} apart in ${name}, for every colour vision`, () => {
        for (let i = 1; i < steps.length; i += 1) {
          const [before, after] = [steps[i - 1]!, steps[i]!]
          expect(deltaE(before, after), `${i} to ${i + 1}`).toBeGreaterThanOrEqual(NEIGHBOUR[name]!)
          for (const deficiency of DEFICIENCIES) {
            expect(
              deltaE(simulate(before, deficiency), simulate(after, deficiency)),
              `${i} to ${i + 1} as ${deficiency}`,
            ).toBeGreaterThanOrEqual(NEIGHBOUR[name]!)
          }
        }
      })

      if (sport === 'ride' && name === 'dark') {
        it('keeps every ride step saturated and no step pale in dark: hard is not faded', () => {
          const found = steps.map(oklch)
          for (const [i, step] of found.entries()) {
            expect(step.chroma, `zone ${i + 1} chroma`).toBeGreaterThanOrEqual(DARK_MIN_CHROMA)
            expect(step.lightness, `zone ${i + 1} lightness`).toBeLessThanOrEqual(
              DARK_MAX_LIGHTNESS,
            )
          }
          // The hardest zone is at least as saturated as the easiest, and more luminous.
          expect(found[4]!.chroma).toBeGreaterThanOrEqual(found[0]!.chroma - 0.02)
          expect(found[4]!.lightness).toBeGreaterThan(found[0]!.lightness)
        })
      }

      if (sport === 'run') {
        it(`keeps every run step saturated enough and none pale in ${name}`, () => {
          const found = steps.map(oklch)
          for (const [i, step] of found.entries()) {
            expect(step.chroma, `zone ${i + 1} chroma`).toBeGreaterThanOrEqual(MIN_CHROMA[i]!)
            expect(step.lightness, `zone ${i + 1} lightness`).toBeLessThanOrEqual(MAX_LIGHTNESS)
          }
        })

        it(`keeps every run step ${FROM_CRITICAL} from the status red in ${name}`, () => {
          const critical = colour(tokens, 'status-critical')
          for (const [i, step] of steps.entries()) {
            expect(deltaE(step, critical), `zone ${i + 1}`).toBeGreaterThanOrEqual(FROM_CRITICAL)
          }
        })

        it(`runs the ${name} steps through the orange to umber band, with chroma falling toward zone 5`, () => {
          const found = steps.map(oklch)
          expect(found[4]!.chroma).toBeLessThan(found[0]!.chroma)
          // Red is hue 25; the ramp stays in the orange to umber band.
          for (const step of found) {
            expect(step.hue).toBeGreaterThanOrEqual(HUE_BAND[0])
            expect(step.hue).toBeLessThanOrEqual(HUE_BAND[1])
          }
        })
      }

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
