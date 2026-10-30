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

/** The least CIEDE2000 between two colours to a reader with normal vision and with the worst deficiency. */
function apart(first: string, second: string): { normal: number; worst: number } {
  const normal = deltaE(first, second)
  const worst = Math.min(
    normal,
    ...DEFICIENCIES.map((deficiency) =>
      deltaE(simulate(first, deficiency), simulate(second, deficiency)),
    ),
  )
  return { normal, worst }
}

describe('the run colour is coral, owned apart from the status red', () => {
  it.each(schemes)('%s: coral clears the card and the page by 3:1', (_name, tokens) => {
    for (const surface of ['surface-0', 'surface-1']) {
      expect(
        contrast(colour(tokens, 'series-run'), colour(tokens, surface)),
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(schemes)(
    '%s: coral is 14 from the critical red, and 10 under the worst vision',
    (_name, tokens) => {
      const { normal, worst } = apart(
        colour(tokens, 'series-run'),
        colour(tokens, 'status-critical'),
      )
      expect(normal).toBeGreaterThanOrEqual(14)
      expect(worst).toBeGreaterThanOrEqual(10)
    },
  )

  it.each(schemes)('%s: coral is 38 from the ride blue under every vision', (_name, tokens) => {
    const { worst } = apart(colour(tokens, 'series-run'), colour(tokens, 'series-ride'))
    expect(worst).toBeGreaterThanOrEqual(38)
  })

  it.each(schemes)('%s: the run ink reads 4.5:1 on the page and on the card', (_name, tokens) => {
    for (const surface of ['surface-0', 'surface-1']) {
      expect(contrast(colour(tokens, 'run-ink'), colour(tokens, surface))).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('is no longer the crimson it replaced', () => {
    expect(tokensCss).not.toMatch(/e5304f|f0435f/i)
  })
})
