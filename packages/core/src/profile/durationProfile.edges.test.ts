import { describe, expect, it } from 'vitest'
import { durationProfile } from './index'
import type { ProfilePoint } from './index'
import { refineShape } from './morton'

/** Morton's model for a 250 W rider: CP 250, W' 20 kJ, Pmax 1000. */
const trueValue = (t: number): number => 250 + 20_000 / (t + 20_000 / (1000 - 250))

function curve(durations: number[], session: (i: number) => string = (i) => `s${i % 4}`) {
  return durations.map((durationS, i): ProfilePoint => ({
    durationS,
    value: trueValue(durationS),
    sessionId: session(i),
  }))
}

const LONG = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600]

describe('a lone best at 15 s or under', () => {
  it('has no row of its own, since the others hold nothing short to read it from', () => {
    const profile = durationProfile(curve(LONG.filter((d) => d === 5 || d > 15)))
    expect(profile.status).toBe('ready')
    if (profile.status !== 'ready') return
    expect(profile.rows.map((row) => row.durationS)).not.toContain(5)
    expect(profile.rows.map((row) => row.durationS)).toEqual(LONG.filter((d) => d > 15))
  })

  it('does not widen the others, which are still in line on a curve that follows the model', () => {
    const profile = durationProfile(curve(LONG.filter((d) => d === 5 || d > 15)))
    if (profile.status !== 'ready') throw new Error('not ready')
    expect(profile.rows.every((row) => row.standsOut === null)).toBe(true)
    expect(profile.rows.every((row) => Math.abs(row.residual) < 0.05)).toBe(true)
  })

  it('still lets a second short best be read from the first', () => {
    const profile = durationProfile(curve(LONG.filter((d) => d <= 15 || d > 30)))
    if (profile.status !== 'ready') throw new Error('not ready')
    expect(profile.rows.map((row) => row.durationS).slice(0, 3)).toEqual([5, 10, 15])
  })
})

describe('a curve no model fits', () => {
  it('says it is unfit, not that it needs more durations, when every refit fails', () => {
    // Faster the longer it is held: no critical-power curve rises with duration.
    const rising = [5, 60, 720, 1200, 3600].map((durationS, i): ProfilePoint => ({
      durationS,
      value: 100 + 40 * i,
      sessionId: `s${i % 2}`,
    }))
    expect(durationProfile(rising)).toEqual({ status: 'unfit' })
  })
})

describe('the sessions a profile counts', () => {
  it('counts the sessions of the durations shown, not of the short bests it leaves out', () => {
    // Without a best at 15 s or under only 2 min and up are shown, and one session holds all of those.
    const points = curve([30, 45, 60, 120, 180, 300, 600, 1200, 3600], (i) =>
      i < 3 ? `short-${i}` : 'one-session',
    )
    expect(durationProfile(points)).toEqual({ status: 'missing', missing: ['sessions'] })
  })
})

describe('refineShape', () => {
  const bounds = { lo: 0, hi: 6, step: 0.125 }

  it('settles on the cheapest point near the grid point it starts from', () => {
    const refined = refineShape((x) => (x - 2.03) ** 2, 2, bounds)
    expect(refined).toBeCloseTo(2.03, 3)
  })

  it('keeps the grid point when no point between its neighbours has a valid curve', () => {
    // Only the grid point itself is valid, so both search points cost nothing but infinity.
    const onlyGrid = (x: number): number => (x === 2 ? 1 : Infinity)
    expect(refineShape(onlyGrid, 2, bounds)).toBe(2)
  })

  it('keeps the grid point when the search drifts to a costlier one', () => {
    expect(refineShape((x) => (x === 2 ? 0 : 5 + Math.abs(x - 2)), 2, bounds)).toBe(2)
  })
})
