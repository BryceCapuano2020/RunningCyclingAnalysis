import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { DEFICIENCIES, deltaE, oklch, simulate } from './colourDifference'
import { contrast } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'
import type { Tokens } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const schemes: [string, Tokens][] = [['paper', resolved(declared(tokensCss, ':root'))]]

/** The least contrast a graphic that carries meaning reaches against what it sits on. */
const GRAPHIC = 3
/** The least contrast of the text inside a step. */
const TEXT = 4.5
/** The least CIEDE2000 between neighbouring steps, to a reader with normal colour vision and with each deficiency. */
const NEIGHBOUR = 7
/** The lightest a long-ramp step may be; effort never fades to pale. */
const MAX_LIGHTNESS_LONG = 0.8
/**
 * The run ramp runs from orange into umber and its chroma falls toward the strong end, so effort
 * deepens into earth and never into the status red. Steps 1 to 3 keep chroma 0.12 or more and steps 4
 * and 5 keep 0.07 or more, ; no step is paler than 0.90 lightness (OKLCH).
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
          expect(contrast(step, colour(tokens, 'paper'))).toBeGreaterThanOrEqual(GRAPHIC)
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

      it(`orders the ${sport} steps by effort in ${name}: darker with effort`, () => {
        const against = steps.map((step) => contrast(step, '#000000'))
        const sorted = [...against].sort((a, b) => b - a)
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

/**
 * The long ramp, which a bar of seven zones (a ride's power) reads. Seven steps leave less room between neighbours
 * than five, so they sit at least this far apart, to every colour vision: a little under the five-step ramp's. Each
 * step is numbered and carries its percent, and the table says the zone.
 */
const LONG_NEIGHBOUR = 5.5
const LONG_STEPS = [1, 2, 3, 4, 5, 6, 7] as const

describe('the long zone ramp', () => {
  for (const [name, tokens] of schemes) {
    const steps = LONG_STEPS.map((step) => colour(tokens, `zone-ride-long-${step}`))
    const inkOfLong = (step: number) => colour(tokens, `zone-ink-long-${step}`)

    it(`has seven steps, and every one is a colour, in ${name}`, () => {
      expect(steps).toHaveLength(7)
      for (const step of steps) expect(step).toMatch(/^#[0-9a-f]{6}$/)
    })

    it(`keeps ${GRAPHIC}:1 against the card and the page in ${name} for every step`, () => {
      for (const step of steps) {
        expect(contrast(step, colour(tokens, 'paper'))).toBeGreaterThanOrEqual(GRAPHIC)
      }
    })

    it(`keeps ${TEXT}:1 for the text inside each step in ${name}, so a percent in zone 6 or 7 reads`, () => {
      steps.forEach((step, i) => {
        expect(contrast(inkOfLong(i + 1), step), `zone ${i + 1}`).toBeGreaterThanOrEqual(TEXT)
      })
    })

    it(`keeps neighbouring steps ${LONG_NEIGHBOUR} apart in ${name}, for every colour vision`, () => {
      for (let i = 1; i < steps.length; i += 1) {
        const [before, after] = [steps[i - 1]!, steps[i]!]
        expect(deltaE(before, after), `${i} to ${i + 1}`).toBeGreaterThanOrEqual(LONG_NEIGHBOUR)
        for (const deficiency of DEFICIENCIES) {
          expect(
            deltaE(simulate(before, deficiency), simulate(after, deficiency)),
            `${i} to ${i + 1} as ${deficiency}`,
          ).toBeGreaterThanOrEqual(LONG_NEIGHBOUR)
        }
      }
    })

    it(`orders the steps by effort in ${name}: darker with effort`, () => {
      const against = steps.map((step) => contrast(step, '#000000'))
      const sorted = [...against].sort((a, b) => b - a)
      expect(against).toEqual(sorted)
    })

    it(`never lets a step fall to black or fade to white in ${name}`, () => {
      for (const [i, step] of steps.entries()) {
        const { lightness, chroma } = oklch(step)
        expect(lightness, `zone ${i + 1} lightness`).toBeGreaterThanOrEqual(0.25)
        expect(lightness, `zone ${i + 1} lightness`).toBeLessThanOrEqual(MAX_LIGHTNESS_LONG)
        expect(chroma, `zone ${i + 1} chroma`).toBeGreaterThanOrEqual(0.12)
      }
    })
  }

  it('is the ride ramp: every step is blue, never the run ramp’s orange', () => {
    for (const [, tokens] of schemes) {
      for (const step of LONG_STEPS) {
        const { hue } = oklch(colour(tokens, `zone-ride-long-${step}`))
        expect(hue, `zone ${step}`).toBeGreaterThanOrEqual(220)
        expect(hue, `zone ${step}`).toBeLessThanOrEqual(295)
      }
    }
  })
})
