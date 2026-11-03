import { describe, expect, it } from 'vitest'
import { robustMean } from './robustMean'

const equal = (values: number[]) => values.map((value) => ({ value, weight: 1 }))

describe('the robust mean', () => {
  it('is the plain mean where the values agree', () => {
    const mean = robustMean(equal([99, 100, 101, 100, 100]))!
    expect(mean.value).toBeCloseTo(100, 0)
    expect(mean.weights.every((w) => w > 0)).toBe(true)
  })

  it('ignores a single wild value', () => {
    const mean = robustMean(equal([100, 101, 99, 100, 102, 98, 160]))!
    expect(mean.value).toBeCloseTo(100, 0)
    expect(mean.weights[6]).toBe(0)
    expect(mean.of).toBe(7)
  })

  it('gives a heavier value more say', () => {
    const light = robustMean([
      { value: 100, weight: 1 },
      { value: 104, weight: 1 },
    ])!
    const heavy = robustMean([
      { value: 100, weight: 1 },
      { value: 104, weight: 3 },
    ])!
    expect(heavy.value).toBeGreaterThan(light.value)
  })

  it('reads its relative error as 1 over the root of the weights it kept', () => {
    const mean = robustMean([
      { value: 100, weight: 400 },
      { value: 100, weight: 400 },
    ])!
    expect(mean.relativeError).toBeCloseTo(1 / Math.sqrt(800), 10)
  })

  it('leaves out values with no weight or that are not positive and finite, and keeps the order of the weights', () => {
    const mean = robustMean([
      { value: 100, weight: 1 },
      { value: 500, weight: 0 },
      { value: NaN, weight: 1 },
      { value: -3, weight: 1 },
      { value: 100, weight: 1 },
    ])!
    expect(mean.of).toBe(2)
    expect(mean.weights.map((w) => w > 0)).toEqual([true, false, false, false, true])
  })

  it('is null with nothing to average', () => {
    expect(robustMean([])).toBeNull()
    expect(robustMean([{ value: 100, weight: 0 }])).toBeNull()
  })
})

/** The mean the plain way: a sort for each median, objects for each point. What the selection and the buffers must not change. */
function reference(points: { value: number; weight: number }[]): number {
  const live = points.filter((p) => p.weight > 0 && Number.isFinite(p.value) && p.value > 0)
  const median = (list: { value: number; weight: number }[]) => {
    const sorted = [...list].sort((a, b) => a.value - b.value)
    const total = sorted.reduce((sum, p) => sum + p.weight, 0)
    let seen = 0
    for (const p of sorted) if ((seen += p.weight) >= total / 2) return p.value
    return NaN
  }
  let centre = median(live)
  const deviation = median(
    live.map((p) => ({ value: Math.abs(p.value - centre), weight: p.weight })),
  )
  const scale = Math.max(1.4826 * deviation, 0.02 * centre)
  for (let pass = 0; pass < 6; pass++) {
    const next = live.map((p) => {
      const u = (p.value - centre) / (4.685 * scale)
      return Math.abs(u) >= 1 ? 0 : p.weight * (1 - u * u) ** 2
    })
    const total = next.reduce((sum, w) => sum + w, 0)
    if (!(total > 0)) break
    centre = live.reduce((sum, p, i) => sum + p.value * next[i]!, 0) / total
  }
  return centre
}

describe('the robust mean against the plain algorithm', () => {
  it('gives the same value on seeded sets, with ties, a wild value and uneven weights', () => {
    let seed = 7
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
    let sets = 0
    for (let n = 1; n <= 60; n++) {
      const points = Array.from({ length: n }, () => ({
        // Rounded values tie; a few are far off.
        value: Math.round((10 + 4 * next()) * 4) / 4 + (next() < 0.05 ? 20 : 0),
        weight: Math.round(1 + 9 * next()) * (next() < 0.1 ? 0 : 1),
      }))
      const plain = points.some((p) => p.weight > 0) ? reference(points) : null
      const got = robustMean(points)
      if (plain === null) expect(got).toBeNull()
      else expect(got!.value).toBeCloseTo(plain, 9)
      sets++
    }
    expect(sets).toBe(60)
  })

  it('is unmoved by the buffers of an earlier, larger call', () => {
    const big = Array.from({ length: 400 }, (_, i) => ({
      value: 10 + (i % 7),
      weight: 1 + (i % 3),
    }))
    robustMean(big)
    const small = [
      { value: 100, weight: 1 },
      { value: 101, weight: 1 },
      { value: 99, weight: 1 },
    ]
    expect(robustMean(small)!.value).toBeCloseTo(reference(small), 9)
  })
})
