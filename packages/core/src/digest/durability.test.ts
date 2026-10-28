import { describe, expect, it } from 'vitest'
import { durabilityPoints } from './durability'

const ones = (n: number) => new Uint8Array(n).fill(1)

/** A stream of `base` watts with a block of another value at each [from, to, value]. */
function stream(n: number, base: number, blocks: [number, number, number][]): Float64Array {
  const values = new Float64Array(n).fill(base)
  for (const [from, to, value] of blocks) values.fill(value, from, to)
  return values
}

const at = (points: ReturnType<typeof durabilityPoints>, afterS: number, durationS: number) =>
  points.find((p) => p.afterS === afterS && p.durationS === durationS)?.value

describe('durabilityPoints', () => {
  it('scores only windows that start once the moving time has passed', () => {
    const n = 14_400
    // 500 W from 3400 s to 3700 s and 300 W from 3700 s to 4800 s, on a base of 150 W.
    const values = stream(n, 150, [
      [3400, 3700, 500],
      [3700, 4800, 300],
    ])
    const points = durabilityPoints(values, ones(n), ones(n), 'a')
    // The best 300 s window starting at 3600 s or later is the one that starts at 3600 s.
    expect(at(points, 3600, 300)).toBeCloseTo((100 * 500 + 200 * 300) / 300, 9)
    expect(at(points, 3600, 1200)).toBeCloseTo((100 * 500 + 1100 * 300) / 1200, 9)
    // After 5400 s there is only the base.
    expect(at(points, 5400, 300)).toBe(150)
    expect(at(points, 7200, 1200)).toBe(150)
  })

  it('matches a brute-force search of every window', () => {
    const n = 9000
    let seed = 7
    const values = Float64Array.from({ length: n }, () => {
      seed = (seed * 48271) % 2147483647
      return 100 + (seed % 200)
    })
    const points = durabilityPoints(values, ones(n), ones(n), 'a')
    for (const afterS of [3600, 5400, 7200]) {
      for (const d of [300, 1200]) {
        let best = 0
        for (let s = afterS; s + d <= n; s++) {
          let sum = 0
          for (let i = s; i < s + d; i++) sum += values[i]!
          best = Math.max(best, sum / d)
        }
        expect(at(points, afterS, d)).toBeCloseTo(best, 9)
      }
    }
  })

  it('counts pauses as time but not as moving time, so the late windows start later', () => {
    const n = 9000
    const moving = ones(n)
    moving.fill(0, 0, 900)
    const values = stream(n, 100, [[3600, 4200, 300]])
    const points = durabilityPoints(values, ones(n), moving, 'a')
    // 3600 moving seconds pass at index 4500, past the 300 W block.
    expect(at(points, 3600, 300)).toBe(100)
  })

  it('omits what the activity cannot support', () => {
    const n = 7000
    const points = durabilityPoints(stream(n, 200, []), ones(n), ones(n), 'a')
    expect(points.map((p) => [p.afterS, p.durationS])).toEqual([
      [3600, 300],
      [3600, 1200],
      [5400, 300],
      [5400, 1200],
    ])
    expect(durabilityPoints(stream(3000, 200, []), ones(3000), ones(3000), 'a')).toEqual([])
  })

  it('omits a duration whose windows all hold an invalid sample, and a zero best', () => {
    const n = 9000
    const valid = ones(n)
    for (let i = 3700; i < n; i += 400) valid[i] = 0
    expect(at(durabilityPoints(stream(n, 200, []), valid, ones(n), 'a'), 3600, 300)).toBe(200)
    expect(
      at(durabilityPoints(stream(n, 200, []), valid, ones(n), 'a'), 3600, 1200),
    ).toBeUndefined()
    expect(durabilityPoints(new Float64Array(n), ones(n), ones(n), 'a')).toEqual([])
  })
})
