import { describe, expect, it } from 'vitest'
import { contrast, luminance } from '../../styles/contrastMath'
import { colour, declared, resolved } from '../../styles/tokenSheet'
import type { Tokens } from '../../styles/tokenSheet'
import { readStylesheet } from '../components/stylesheet'

const tokensCss = await readStylesheet(import.meta.url, '../../styles/tokens.css')
const css = await readStylesheet(import.meta.url, './TrainingCalendarChart.css')
const lightRaw = declared(tokensCss, ':root')
const darkRaw = declared(tokensCss, ":root:not([data-theme='light'])")
const schemes: [string, Tokens][] = [
  ['light', resolved(lightRaw)],
  ['dark', resolved(new Map([...lightRaw, ...darkRaw]))],
]

/** The least contrast of the first tint against a week with no training, so a gap reads next to any week of training. */
const FIRST_AGAINST_NONE = 2
/** The least contrast between one tint and the next, so five tints stay five. */
const NEIGHBOUR = 1.08

/** The share of ink in each of the four mixed tints, from the stylesheet: the fifth is the ink itself. */
const SHARES = [
  ...css.matchAll(
    /--calendar-step-[1-4]:\s*color-mix\(in srgb, var\(--calendar-ink\) (\d+)%, var\(--surface-0\)\)/g,
  ),
].map((match) => Number(match[1]) / 100)

/** What `color-mix(in srgb, ink share, base)` paints, as the browser mixes opaque colours. */
function mixed(ink: string, base: string, share: number): string {
  const channels = [1, 3, 5].map((at) => {
    const top = parseInt(ink.slice(at, at + 2), 16)
    const below = parseInt(base.slice(at, at + 2), 16)
    return Math.round(top * share + below * (1 - share))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

describe('the calendar ramp', () => {
  it('has four mixed tints that grow in ink, and the ink itself as the fifth', () => {
    expect(SHARES).toHaveLength(4)
    expect(SHARES).toEqual([...SHARES].sort((a, b) => a - b))
    expect(css).toMatch(/--calendar-step-5:\s*var\(--calendar-ink\)/)
    expect(css).toMatch(/--calendar-step-0:\s*var\(--surface-2\)/)
  })

  for (const [name, tokens] of schemes) {
    for (const ink of ['neutral-mark', 'series-run', 'series-ride']) {
      const steps = [
        ...SHARES.map((share) => mixed(colour(tokens, ink), colour(tokens, 'surface-0'), share)),
        colour(tokens, ink),
      ]

      it(`keeps the first ${ink} tint ${FIRST_AGAINST_NONE}:1 from no training in ${name}`, () => {
        expect(contrast(steps[0]!, colour(tokens, 'surface-2'))).toBeGreaterThanOrEqual(
          FIRST_AGAINST_NONE,
        )
      })

      it(`keeps the ${ink} tints apart and in order of ink in ${name}`, () => {
        const lighter = name === 'dark'
        steps.slice(1).forEach((step, i) => {
          const before = steps[i]!
          expect(contrast(step, before)).toBeGreaterThanOrEqual(NEIGHBOUR)
          // Light darkens with hours; dark gets more luminous with them.
          expect(luminance(step) > luminance(before)).toBe(lighter)
        })
      })
    }
  }
})
