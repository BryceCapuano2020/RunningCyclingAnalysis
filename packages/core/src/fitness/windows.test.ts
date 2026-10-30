import { describe, expect, it } from 'vitest'
import { FITNESS } from './params'
import { floorAt, lowLastYear, sigmaAt, slipAt } from './windows'
import type { RunPoint } from './windows'

const M = FITNESS.monitor
const JITTER = [0.012, -0.012, 0.004, -0.004, 0.008, -0.008]

/** Three runs a week at `level(week)` plus a repeating jitter of about 1%, from week 0 to week `weeks`. */
function library(
  weeks: number,
  level: (week: number) => number = () => 0,
  skip = (_w: number) => false,
) {
  const points: RunPoint[] = []
  let k = 0
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 3; i++) {
      const x = level(w) + JITTER[k++ % JITTER.length]!
      if (!skip(w)) points.push({ id: `w${w}-${i}`, t: w * 7 + 1 + i * 2, x })
    }
  }
  return points
}

const dayOf = (week: number) => (week + 1) * 7

describe('the recent window needs runs from two weeks', () => {
  // Quiet, then nothing for five weeks, then one week of three runs 20% low: every window sees one week only.
  const burst = [...library(60), ...[0, 2, 4].map((d) => ({ id: `b${d}`, t: 71 * 7 + d, x: -0.2 }))]

  it('cannot declare a slip from the runs of one week', () => {
    const day = dayOf(71)
    expect(slipAt(burst, day, sigmaAt(burst, day))?.fire ?? false).toBe(false)
  })

  it('declares it once a second week has runs and the contrast holds', () => {
    const more = [...burst, ...[0, 2, 4].map((d) => ({ id: `c${d}`, t: 72 * 7 + d, x: -0.2 }))]
    const day = dayOf(72)
    const slip = slipAt(more, day, sigmaAt(more, day))
    expect(slip).not.toBeNull()
    expect(slip!.fire).toBe(true)
  })
})

describe('the model-error floor', () => {
  const floor = (points: RunPoint[], week: number) =>
    floorAt(points, dayOf(week), sigmaAt(points, dayOf(week)))

  it('is the plain floor for a quiet library and before two years of history', () => {
    expect(floor(library(130), 129)).toBe(M.tau)
    expect(
      floor(
        library(130, (w) => (w % 24 < 12 ? 0.05 : -0.05)),
        60,
      ),
    ).toBe(M.tau)
  })

  it('grows for a library whose level wanders by more than the reference athlete’s', () => {
    // A square wave of 12 weeks up and 12 down, 5% each way: far more than the 2% the floor was set on.
    const wavy = library(130, (w) => (w % 24 < 12 ? 0.05 : -0.05))
    const f = floor(wavy, 129)
    expect(f).toBeGreaterThan(M.tau * 1.5)
    expect(f).toBeLessThanOrEqual(M.floorMax)
  })

  it('leaves out the weeks of a dip that was real: they are not the wander', () => {
    // Two dips of 8%, 27 and 22 weeks long, inside the 100 weeks the floor reads: as wander they raise it, as dips they do not.
    const level = (w: number) => ((w >= 25 && w < 52) || (w >= 70 && w < 92) ? -0.08 : 0)
    const dipped = library(130, level)
    const dips = [
      { fromDay: 25 * 7, toDay: 52 * 7 },
      { fromDay: 70 * 7, toDay: 92 * 7 },
    ]
    const day = dayOf(129)
    expect(floorAt(dipped, day, sigmaAt(dipped, day))).toBeGreaterThan(M.tau * 1.5)
    expect(floorAt(dipped, day, sigmaAt(dipped, day), dips)).toBe(M.tau)
  })

  it('is not set by one step near the end of the history', () => {
    expect(
      floor(
        library(130, (w) => (w >= 105 ? -0.08 : 0)),
        129,
      ),
    ).toBe(M.tau)
  })

  it('raises the bar a slip has to clear', () => {
    const wavy = library(130, (w) => (w % 24 < 12 ? 0.05 : -0.05))
    const quiet = library(130)
    const drop = (points: RunPoint[]) =>
      points.map((p) => (p.t >= 123 * 7 ? { ...p, x: p.x - 0.06 } : p))
    const day = dayOf(129)
    const zOf = (points: RunPoint[]) => slipAt(points, day, sigmaAt(points, day))!.z
    expect(zOf(drop(quiet))).toBeLessThan(-M.zSlip)
    // The same 6% drop is a weaker statement in a library that already swings by 10% between its levels.
    expect(Math.abs(zOf(drop(wavy)))).toBeLessThan(Math.abs(zOf(drop(quiet))))
  })
})

describe('a drop that came at this time last year', () => {
  const season = (w: number) => 0.04 * Math.sin((2 * Math.PI * w) / 52)
  const points = library(160, season)
  const day = dayOf(150)
  const sigma = sigmaAt(points, day)

  it('is the season’s: the same scale read as low a year earlier', () => {
    const slip = { delta: -0.05, z: -4, fire: true, reference: 0, weeks: 8, baseWeeks: 32 }
    // Week 150 is a trough (sin(2 pi 150/52) is negative): last year's equivalent was as low.
    expect(lowLastYear(points, day, slip, sigma)).toBe(true)
  })

  it('is not, when last year at that time was level', () => {
    const flatLastYear = library(160, (w) => (w >= 140 ? -0.06 : 0))
    const slip = { delta: -0.06, z: -4, fire: true, reference: 0, weeks: 8, baseWeeks: 32 }
    expect(lowLastYear(flatLastYear, dayOf(150), slip, sigmaAt(flatLastYear, dayOf(150)))).toBe(
      false,
    )
  })

  it('cannot say without the runs of that year', () => {
    const young = library(40, () => 0)
    const slip = { delta: -0.06, z: -4, fire: true, reference: 0, weeks: 8, baseWeeks: 32 }
    expect(lowLastYear(young, dayOf(39), slip, sigmaAt(young, dayOf(39)))).toBe(false)
  })
})
