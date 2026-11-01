import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { LOOKBACK } from './params'
import { medianInPlace } from '../math'
import type { RunPoint } from '../fitness/windows'
import { localMedians } from './localMedians'
import { partition, plateauCost } from './partition'
import type { PlateauSums } from './partition'

const S = LOOKBACK.segment

/** The cut as the full search makes it: every start tried for every end. The pruned search must give the very same arrays. */
function exhaustive(weeks: number, count: Float64Array, present: Float64Array, sums: PlateauSums) {
  const cost = (a: number, b: number) => plateauCost(count, sums, a, b)
  const best = new Float64Array(weeks + 1).fill(Number.POSITIVE_INFINITY)
  const from = new Int32Array(weeks + 1).fill(-1)
  best[0] = -S.beta
  for (let b = S.minWeeks; b <= weeks; b++) {
    for (let a = 0; a + S.minWeeks <= b; a++) {
      if (best[a] === Number.POSITIVE_INFINITY) continue
      if (count[b]! - count[a]! < S.minRuns || present[b]! - present[a]! < S.minDistinctWeeks)
        continue
      const value = best[a]! + cost(a, b) + S.beta
      if (value < best[b]!) {
        best[b] = value
        from[b] = a
      }
    }
  }
  return { best, from }
}

/** Weekly runs with a level that steps at the given weeks, noise of the given size, and weeks with no run. */
function series(seed: number, weeks: number, steps: number[], noise: number, gapShare: number) {
  const random = mulberry32(seed)
  const count = new Float64Array(weeks + 1)
  const sum = new Float64Array(weeks + 1)
  const squares = new Float64Array(weeks + 1)
  const present = new Float64Array(weeks + 1)
  let level = 0
  for (let w = 0; w < weeks; w++) {
    if (steps.includes(w)) level += (random() - 0.5) * 0.4
    let runs = 0
    let s = 0
    let q = 0
    if (random() >= gapShare) {
      runs = 1 + Math.floor(random() * 4)
      for (let r = 0; r < runs; r++) {
        const x = level + (random() - 0.5) * noise
        s += x
        q += x * x
      }
    }
    count[w + 1] = runs
    sum[w + 1] = s
    squares[w + 1] = q
    present[w + 1] = runs > 0 ? 1 : 0
  }
  for (let i = 1; i <= weeks; i++) {
    count[i]! += count[i - 1]!
    sum[i]! += sum[i - 1]!
    squares[i]! += squares[i - 1]!
    present[i]! += present[i - 1]!
  }
  const sigma = 0.02
  const sums = { sum, squares, sigma2: sigma * sigma }
  return { weeks, count, present, sums, scale: squares[weeks]! / (sigma * sigma) }
}

describe('partition', () => {
  it('gives the very arrays the full search gives, whatever the runs do', () => {
    const cases: [number, number, number[], number, number][] = [
      [1, 120, [], 0.04, 0],
      [2, 300, [60, 140, 220], 0.06, 0.1],
      [3, 676, [100, 101, 300, 480, 481, 600], 0.08, 0.3],
      [4, 400, [50, 51, 52, 53, 54, 55], 0.02, 0.6],
      [5, 676, Array.from({ length: 30 }, (_, i) => 20 + i * 21), 0.1, 0.05],
      [6, 90, [30, 60], 0, 0],
      [7, 500, [250], 0.0001, 0.8],
    ]
    for (let seed = 10; seed < 40; seed++) {
      cases.push([
        seed,
        80 + ((seed * 37) % 600),
        [seed * 5, seed * 11, seed * 17],
        0.05,
        (seed % 7) / 10,
      ])
    }
    for (const [seed, weeks, steps, noise, gap] of cases) {
      const s = series(seed, weeks, steps, noise, gap)
      const full = exhaustive(s.weeks, s.count, s.present, s.sums)
      const pruned = partition(s.weeks, s.count, s.present, s.sums, s.scale)
      expect(Array.from(pruned.from), `seed ${seed}`).toEqual(Array.from(full.from))
      expect(Array.from(pruned.best), `seed ${seed}`).toEqual(Array.from(full.best))
    }
  })

  it('gives the same on a series that is all one value, where every start ties', () => {
    const weeks = 200
    const count = Float64Array.from({ length: weeks + 1 }, (_, i) => i * 2)
    const present = Float64Array.from({ length: weeks + 1 }, (_, i) => i)
    const sums = {
      sum: new Float64Array(weeks + 1),
      squares: new Float64Array(weeks + 1),
      sigma2: 1,
    }
    const full = exhaustive(weeks, count, present, sums)
    const pruned = partition(weeks, count, present, sums, 0)
    expect(Array.from(pruned.from)).toEqual(Array.from(full.from))
    expect(Array.from(pruned.best)).toEqual(Array.from(full.best))
  })
})

describe('localMedians', () => {
  const direct = (runs: readonly RunPoint[], week: number) => {
    const near = runs.filter(
      (r) => r.t >= (week - S.clipWeeks) * 7 && r.t < (week + S.clipWeeks + 1) * 7,
    )
    return near.length === 0 ? 0 : medianInPlace(Float64Array.from(near, (r) => r.x))
  }

  it('gives the median of the runs in reach, for weeks in order, repeated and out of order', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = mulberry32(seed)
      const runs: RunPoint[] = []
      let t = 3
      for (let i = 0; i < 400; i++) {
        // Gaps of weeks, several runs on one day, and values that repeat.
        t += random() < 0.05 ? 7 * (5 + Math.floor(random() * 60)) : Math.floor(random() * 4)
        runs.push({ t, x: Math.round(random() * 20) / 10 - 1 } as RunPoint)
      }
      const last = Math.floor(runs.at(-1)!.t / 7) + 20
      const medians = localMedians(runs)
      for (let week = -20; week <= last; week += seed % 3 === 0 ? 3 : 1) {
        expect(medians(week), `seed ${seed} week ${week}`).toBe(direct(runs, week))
        expect(medians(week)).toBe(direct(runs, week))
      }
      for (let k = 0; k < 40; k++) {
        const week = Math.floor(random() * (last + 20)) - 20
        expect(medians(week), `seed ${seed} week ${week}`).toBe(direct(runs, week))
      }
    }
  })
})
