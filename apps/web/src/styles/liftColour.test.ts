import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/test/stylesheet'
import { DEFICIENCIES, deltaE, simulate } from './colourDifference'
import { contrast } from './contrastMath'
import { colour, declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const tokens = resolved(declared(tokensCss, ':root'))

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

const lift = colour(tokens, 'lift-ink')

describe('the lift colour is magenta, a corner of the level triangle', () => {
  it('reads 4.5:1 on the paper', () => {
    expect(contrast(lift, colour(tokens, 'paper'))).toBeGreaterThanOrEqual(4.5)
  })

  it('is well apart from the run coral, normally and under the worst vision', () => {
    const { normal, worst } = apart(lift, colour(tokens, 'run-ink'))
    expect(normal).toBeGreaterThanOrEqual(40)
    expect(worst).toBeGreaterThanOrEqual(18)
  })

  it('is apart from the ride blue and the swim teal, so no two corners share a hue', () => {
    expect(apart(lift, colour(tokens, 'ride-ink')).normal).toBeGreaterThanOrEqual(20)
    expect(apart(lift, colour(tokens, 'swim-ink')).normal).toBeGreaterThanOrEqual(35)
  })

  it('is apart from the critical red, which is never a sport', () => {
    const { normal, worst } = apart(lift, colour(tokens, 'status-critical'))
    expect(normal).toBeGreaterThanOrEqual(30)
    expect(worst).toBeGreaterThanOrEqual(15)
  })

  it('is never told apart from the ride blue by colour alone', () => {
    // Under the worst deficiency it falls below the bar the run ink holds (10), so every use sits beside the sport's name.
    expect(apart(lift, colour(tokens, 'ride-ink')).worst).toBeLessThan(10)
  })

  it('has a wash and a sport surface of its own', () => {
    expect(tokens.get('lift-wash')).toBe(`${lift}1f`)
    expect(tokensCss).toMatch(/\[data-sport='lift'\]\s*\{[^}]*--sport-ink:\s*var\(--lift-ink\)/)
    expect(tokensCss).toMatch(/\[data-sport='lift'\]\s*\{[^}]*--sport-wash:\s*var\(--lift-wash\)/)
  })
})
