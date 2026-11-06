import { describe, expect, it } from 'vitest'
import { contrast, luminance } from '../../styles/contrastMath'
import { colour, declared, resolved } from '../../styles/tokenSheet'
import type { Tokens } from '../../styles/tokenSheet'
import { readStylesheet } from '../components/stylesheet'

const tokensCss = await readStylesheet(import.meta.url, '../../styles/tokens.css')
const css = await readStylesheet(import.meta.url, './TrainingCalendarChart.css')
const schemes: [string, Tokens][] = [['paper', resolved(declared(tokensCss, ':root'))]]

/** The least contrast of the first tint against a week with no training, so a gap reads next to any week of training. */
const FIRST_AGAINST_NONE = 1.75
/** The least contrast between one step and the next, so five steps are five: neutral, then a sport's colour. */
const NEIGHBOUR = { neutral: 1.25, sport: 1.15 }

/** The five step expressions of the rule `selector`, by step, as the stylesheet writes them. */
function stepsOf(selector: string): string[] {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} is in the stylesheet`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const steps = [...body.matchAll(/--calendar-step-([1-5]):\s*([^;]+);/g)]
  return steps.map((match) => match[2]!.trim())
}

/** What `color-mix(in srgb, a share, b)` paints, as the browser mixes opaque colours. */
function mixed(top: string, below: string, share: number): string {
  const channels = [1, 3, 5].map((at) => {
    const upper = parseInt(top.slice(at, at + 2), 16)
    const lower = parseInt(below.slice(at, at + 2), 16)
    return Math.round(upper * share + lower * (1 - share))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

/** A step's colour: the ink itself, or the ink mixed into a token by the share the stylesheet gives. */
function stepColour(expression: string, tokens: Tokens, ink: string): string {
  if (expression === 'var(--calendar-ink)') return ink
  const match = /^color-mix\(in srgb, var\(--calendar-ink\) (\d+)%, var\(--([a-z0-9-]+)\)\)$/.exec(
    expression,
  )
  expect(match, `${expression} is the ink or a mix of it`).not.toBeNull()
  return mixed(ink, colour(tokens, match![2]!), Number(match![1]) / 100)
}

describe('the calendar ramp', () => {
  it('takes the sport’s colour for its ink when a sport is filtered, and the neutral ink otherwise', () => {
    expect(css).toMatch(/\.calendar \{[^}]*--calendar-ink:\s*var\(--ink-secondary\)/)
    expect(css).toMatch(/\.calendar\[data-sport\] \{[^}]*--calendar-ink:\s*var\(--sport-ink\)/)
    expect(css).toMatch(/--calendar-step-0:\s*var\(--paper-hover\)/)
  })

  it('has five steps for neutral and for a sport, each set in the sheet', () => {
    expect(stepsOf('.calendar')).toHaveLength(5)
    expect(stepsOf('.calendar[data-sport]')).toHaveLength(5)
    expect(stepsOf('.calendar')[4]).toBe('var(--calendar-ink)')
  })

  for (const [name, tokens] of schemes) {
    for (const [ink, selector, kind] of [
      ['ink-secondary', '.calendar', 'neutral'],
      ['run-ink', '.calendar[data-sport]', 'sport'],
      ['ride-ink', '.calendar[data-sport]', 'sport'],
    ] as const) {
      const steps = stepsOf(selector).map((step) => stepColour(step, tokens, colour(tokens, ink)))

      it(`keeps the first ${ink} step ${FIRST_AGAINST_NONE}:1 from no training in ${name}`, () => {
        expect(contrast(steps[0]!, colour(tokens, 'paper-hover'))).toBeGreaterThanOrEqual(
          FIRST_AGAINST_NONE,
        )
      })

      it(`keeps the ${ink} steps clearly apart and in order of ink in ${name}`, () => {
        steps.slice(1).forEach((step, i) => {
          const before = steps[i]!
          expect(contrast(step, before)).toBeGreaterThanOrEqual(NEIGHBOUR[kind])
          // Ink darkens with hours.
          expect(luminance(step) > luminance(before)).toBe(false)
        })
      })
    }
  }
})
