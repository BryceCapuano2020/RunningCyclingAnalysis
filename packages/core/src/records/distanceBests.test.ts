import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { DISTANCE_BEST_TOLERANCE } from '../constants'
import { QUALITY_THRESHOLDS } from '../quality'
import { distanceBests } from './distanceBests'

/** A 1 Hz stream from runs of [seconds, m/s]. distance[0] is 0 and sample 0 has no step. */
function profile(runs: [number, number][]): { distance: Float64Array; valid: Uint8Array } {
  const speeds = [0]
  for (const [seconds, speed] of runs) for (let s = 0; s < seconds; s++) speeds.push(speed)
  const distance = new Float64Array(speeds.length)
  for (let i = 1; i < speeds.length; i++) distance[i] = distance[i - 1]! + speeds[i]!
  return { distance, valid: new Uint8Array(speeds.length).fill(1) }
}

/** Seconds for one distance, or NaN when that distance is absent from the result. */
function secondsAt(result: { distanceM: number; seconds: number }[], distanceM: number): number {
  return result.find((b) => b.distanceM === distanceM)?.seconds ?? NaN
}

/** The most distance, m, that any run of valid samples with no step above maxStep covers. */
function longestReach(distance: Float64Array, valid: Uint8Array, maxStep: number): number {
  let longest = 0
  let from = -1
  for (let i = 0; i <= distance.length; i++) {
    const usable = i < distance.length && valid[i] === 1
    const jump = usable && from >= 0 && distance[i]! - distance[i - 1]! > maxStep
    if (from >= 0 && (!usable || jump)) {
      longest = Math.max(longest, distance[i - 1]! - distance[from]!)
      from = -1
    }
    if (usable && from < 0) from = i
  }
  return longest
}

describe('distanceBests', () => {
  it('gives exact times for a constant-pace run at every record distance', () => {
    const { distance, valid } = profile([[2500, 4]])
    const bests = distanceBests(distance, valid)
    expect(bests.map((b) => b.distanceM)).toEqual([1000, 1609.344, 5000, 10000])
    expect(bests[0]!.seconds).toBeCloseTo(250, 9)
    expect(bests[1]!.seconds).toBeCloseTo(402.336, 9)
    expect(bests[2]!.seconds).toBeCloseTo(1250, 9)
    expect(bests[3]!.seconds).toBeCloseTo(2500, 9)
  })

  it('gives the half marathon time for a run that covers it', () => {
    // 4 m/s for 5300 s is 21.2 km: the half marathon is 21.0975 km, so it is 5274.375 s.
    const { distance, valid } = profile([[5300, 4]])
    const bests = distanceBests(distance, valid)
    expect(bests.map((b) => b.distanceM)).toEqual([1000, 1609.344, 5000, 10000, 21097.5])
    expect(secondsAt(bests, 21097.5)).toBeCloseTo(21097.5 / 4, 6)
  })

  it('leaves the half marathon out of a run shorter than it', () => {
    const { distance, valid } = profile([[5200, 4]])
    expect(distanceBests(distance, valid).map((b) => b.distanceM)).not.toContain(21097.5)
  })

  it('interpolates both window edges instead of snapping to whole samples', () => {
    // 3 m/s: 1 km takes 333.33 s and a mile 536.45 s, neither a whole number of samples.
    const { distance, valid } = profile([[1000, 3]])
    const bests = distanceBests(distance, valid)
    expect(bests.map((b) => b.distanceM)).toEqual([1000, 1609.344])
    expect(bests[0]!.seconds).toBeCloseTo(1000 / 3, 6)
    expect(bests[1]!.seconds).toBeCloseTo(1609.344 / 3, 6)
  })

  it('finds a fast kilometre in the middle of the run', () => {
    const { distance, valid } = profile([
      [1000, 3],
      [200, 5],
      [1000, 3],
    ])
    expect(secondsAt(distanceBests(distance, valid), 1000)).toBeCloseTo(200, 6)
  })

  it('counts time spent stopped inside a window, as a race clock does', () => {
    // 1 km with a 100 s stop in the middle: the only window is the whole run, 250 + 100 s.
    const { distance, valid } = profile([
      [125, 4],
      [100, 0],
      [125, 4],
    ])
    expect(secondsAt(distanceBests(distance, valid), 1000)).toBeCloseTo(350, 6)
  })

  it('never builds a window across an invalid sample', () => {
    // A 500 m GPS jump at sample 300 would make a kilometre look like 126 s if it were allowed.
    const n = 601
    const distance = Float64Array.from({ length: n }, (_, i) => 4 * i + (i >= 300 ? 500 : 0))
    const valid = new Uint8Array(n).fill(1)
    valid[300] = 0
    expect(secondsAt(distanceBests(distance, valid), 1000)).toBeCloseTo(250, 6)
  })

  it('treats a NaN distance as invalid', () => {
    // Each side of the NaN is 596 m, so no kilometre fits on either side.
    const { distance, valid } = profile([[300, 4]])
    distance[150] = NaN
    expect(distanceBests(distance, valid)).toEqual([])
  })

  it('omits a distance the run does not cover', () => {
    const { distance, valid } = profile([[225, 4]])
    expect(distanceBests(distance, valid)).toEqual([])
  })

  it('omits a covered distance that has no fully valid window', () => {
    const { distance, valid } = profile([[600, 4]])
    valid.fill(0)
    expect(distanceBests(distance, valid)).toEqual([])
  })

  it('matches a brute-force search over every continuous window', () => {
    // Irregular speeds and stops from a fixed generator. The brute force slides the start in 0.05 s
    // steps and interpolates the first time the distance reaches start + span.
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000
    const runs: [number, number][] = []
    for (let k = 0; k < 150; k++) runs.push([1 + Math.floor(random() * 30), random() * 5])
    const { distance, valid } = profile(runs)
    const n = distance.length
    const at = (t: number): number => {
      const k = Math.floor(t)
      return k + 1 >= n
        ? distance[n - 1]!
        : distance[k]! + (t - k) * (distance[k + 1]! - distance[k]!)
    }
    const firstPassage = (x: number): number => {
      let j = 1
      while (distance[j]! < x) j++
      return j - 1 + (x - distance[j - 1]!) / (distance[j]! - distance[j - 1]!)
    }
    const total = distance[n - 1]!
    const bests = distanceBests(distance, valid)
    for (const span of [1000, 1609.344]) {
      let brute = Infinity
      for (let s = 0; s <= n - 1 && at(s) + span <= total; s += 0.05) {
        brute = Math.min(brute, firstPassage(at(s) + span) - s)
      }
      const mine = secondsAt(bests, span)
      expect(mine).toBeLessThanOrEqual(brute + 1e-9)
      expect(brute - mine).toBeLessThan(0.1)
    }
  })

  it('never builds a window across a distance step faster than the top run speed', () => {
    // Steady 3 m/s, then a 600 s gap with no timer pause: the distance is held while the speed
    // still reads 3 m/s, and the 1800 m the gap covered arrives in one second.
    const n = 1500
    const distance = Float64Array.from({ length: n }, (_, i) =>
      i <= 300 ? 3 * i : i < 900 ? 900 : 2700 + 3 * (i - 900),
    )
    const bests = distanceBests(distance, new Uint8Array(n).fill(1))
    expect(secondsAt(bests, 1000)).toBeCloseTo(1000 / 3, 6)
    expect(secondsAt(bests, 1609.344)).toBeCloseTo(1609.344 / 3, 6)
    // No best may imply a speed above the top run speed, the window-level bound on average speed.
    for (const b of bests)
      expect(b.distanceM / b.seconds).toBeLessThanOrEqual(
        QUALITY_THRESHOLDS.speedSpike.maxSpeedMs.run,
      )
  })

  it('agrees with a brute-force search on seeded streams with invalid samples, stops and cut steps', () => {
    // The brute force tries starts every 0.05 s, takes the first moment the span is covered, and
    // accepts a window only if its samples are valid and it holds no step above the top run speed.
    const maxStep = QUALITY_THRESHOLDS.speedSpike.maxSpeedMs.run
    let compared = 0
    for (let seed = 1; seed <= 40; seed++) {
      const random = mulberry32(seed)
      const n = 1000 + Math.floor(random() * 400)
      const speeds = Float64Array.from({ length: n }, (_, i) =>
        i === 0 ? 0 : random() < 0.1 ? 0 : 1 + random() * 5,
      )
      const distance = new Float64Array(n)
      for (let i = 1; i < n; i++) {
        distance[i] = distance[i - 1]! + speeds[i]! + (random() < 0.0015 ? 20 + random() * 40 : 0)
      }
      const valid = Uint8Array.from({ length: n }, () => (random() < 0.998 ? 1 : 0))
      // Prefix counts: invalid samples, and steps above the top run speed ending at each sample.
      const bad = new Int32Array(n + 1)
      const jumps = new Int32Array(n + 1)
      for (let k = 0; k < n; k++) {
        bad[k + 1] = bad[k]! + (valid[k] === 1 ? 0 : 1)
        const step = k > 0 ? distance[k]! - distance[k - 1]! : 0
        jumps[k + 1] = jumps[k]! + (k > 0 && step > maxStep ? 1 : 0)
      }
      const at = (t: number): number => {
        const k = Math.floor(t)
        return k + 1 >= n
          ? distance[n - 1]!
          : distance[k]! + (t - k) * (distance[k + 1]! - distance[k]!)
      }
      const firstPassage = (x: number): number => {
        let lo = 1
        let hi = n - 1
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (distance[mid]! >= x) hi = mid
          else lo = mid + 1
        }
        return lo - 1 + (x - distance[lo - 1]!) / (distance[lo]! - distance[lo - 1]!)
      }
      const bests = distanceBests(distance, valid)
      for (const span of [1000, 1609.344]) {
        let brute = Infinity
        for (let s = 0; s <= n - 1; s += 0.05) {
          const target = at(s) + span
          if (target > distance[n - 1]!) break
          const e = firstPassage(target)
          const a = Math.floor(s)
          const b = Math.ceil(e)
          const clean = bad[b + 1]! - bad[a]! === 0 && jumps[b + 1]! - jumps[a + 1]! === 0
          if (clean) brute = Math.min(brute, e - s)
        }
        const mine = secondsAt(bests, span)
        if (brute === Infinity) {
          // Only the distance tolerance can time a span that no clean stretch covers in full, and it
          // does so exactly when some clean stretch reaches within the tolerance of the span.
          const near =
            longestReach(distance, valid, maxStep) >= span * (1 - DISTANCE_BEST_TOLERANCE)
          expect(Number.isNaN(mine), `seed ${seed}, ${span} m`).toBe(!near)
        } else {
          compared++
          expect(mine, `seed ${seed}, ${span} m`).toBeLessThanOrEqual(brute + 1e-6)
          expect(brute - mine, `seed ${seed}, ${span} m`).toBeLessThan(0.5)
        }
      }
    }
    // Most seeds must reach a comparable best, or the check would prove nothing.
    expect(compared).toBeGreaterThan(40)
  })

  it('decides which distances a run covers from its recorded distance, not the lowered one', () => {
    // 5.02 km recorded, but the lowered stream reaches only 4.85 km: the run still covers 5 km.
    const { distance: recorded } = profile([[1673, 3]])
    const { distance, valid } = profile([[1673, 2.9]])
    expect(recorded.at(-1)).toBeGreaterThan(5000)
    expect(distance.at(-1)).toBeLessThan(5000)
    expect(secondsAt(distanceBests(distance, valid, recorded), 5000)).toBeCloseTo(5000 / 3, 6)
  })

  it('times a distance by the lowered stream when its windows reach it', () => {
    // The recorded distance runs at 4 m/s, but the lowered stream only at 3 m/s: the 1 km is 333 s.
    const recorded = profile([[1500, 4]]).distance
    const { distance, valid } = profile([[1500, 3]])
    expect(secondsAt(distanceBests(distance, valid, recorded), 1000)).toBeCloseTo(1000 / 3, 6)
  })

  it('counts a race a little short of a record distance, timed up to the exact distance', () => {
    // 4 m/s for 2480 s is 9.92 km: within 1% of 10 km, so it is a 10 km run at 2500 s.
    const { distance, valid } = profile([[2480, 4]])
    expect(distance.at(-1)).toBe(9920)
    const bests = distanceBests(distance, valid)
    expect(secondsAt(bests, 10_000)).toBeCloseTo(2500, 6)
    // The distances it does cover are timed exactly, with no scaling.
    expect(secondsAt(bests, 5000)).toBeCloseTo(1250, 6)
  })

  it('times a short stretch that starts after a masked section, whatever the rounding of its distances', () => {
    // The stretch's reach added to its first distance can land above its last distance in floating
    // point (about 2% of stretches), so a sweep for exactly that span finds nothing. Every seed must
    // still give a 5 km best, from a stretch about 4,960 m (0.8% short) that starts after a masked sample.
    for (let seed = 1; seed <= 300; seed++) {
      const random = mulberry32(seed)
      const head = 11
      const distance = new Float64Array(head + 1241)
      distance[0] = 1234.5678 * random() * 10
      for (let i = 1; i < distance.length; i++) {
        const step = i <= head ? 3 : 3.9 + 0.2 * random()
        distance[i] = distance[i - 1]! + step
      }
      const valid = new Uint8Array(distance.length).fill(1)
      valid[head - 1] = 0
      const seconds = secondsAt(distanceBests(distance, valid), 5000)
      expect(seconds, `seed ${seed}`).toBeGreaterThan(1240)
      expect(seconds, `seed ${seed}`).toBeLessThan(1260)
    }
  })

  it('does not count a run further short of a record distance than the tolerance', () => {
    const { distance, valid } = profile([[2460, 4]])
    expect(distance.at(-1)).toBe(9840)
    expect(secondsAt(distanceBests(distance, valid), 10_000)).toBeNaN()
  })

  it('does not scale the time of a run that covers the distance', () => {
    // A slow finish: the fastest 5 km is the first 5 km, 1000 s, not a scaled shorter stretch.
    const { distance, valid } = profile([
      [1000, 5],
      [200, 2],
    ])
    expect(secondsAt(distanceBests(distance, valid), 5000)).toBeCloseTo(1000, 6)
  })

  it('leaves out a time faster than the world record for the distance', () => {
    // 1 km in 100 s (10 m/s) cannot be run; the same kilometre in 160 s can.
    const impossible = profile([[300, 10]])
    expect(secondsAt(distanceBests(impossible.distance, impossible.valid), 1000)).toBeNaN()
    const possible = profile([[300, 6.25]])
    expect(secondsAt(distanceBests(possible.distance, possible.valid), 1000)).toBeCloseTo(160, 6)
  })

  it('falls back to the fastest window that could have been run, not to no time', () => {
    // 100 s at 10 m/s is a kilometre in 100 s, which no one runs. The windows that reach a kilometre
    // by taking in some of the slower running either side are possible, so the best is among those.
    const { distance, valid } = profile([
      [300, 5],
      [100, 10],
      [300, 5],
    ])
    const seconds = secondsAt(distanceBests(distance, valid), 1000)
    expect(seconds).toBeGreaterThan(125)
    expect(seconds).toBeLessThan(200)
  })

  it('prefers a stretch that covers a distance to a faster stretch that falls just short of it', () => {
    // Stretch one covers 5 km at 4 m/s (1,250 s). Stretch two, after a masked sample, is 4,960 m at
    // 5 m/s, which scaled up to 5 km would be 1,000 s. The exact stretch wins: the tolerance is a fallback.
    const a = profile([[1250, 4]])
    const b = profile([[992, 5]])
    const distance = Float64Array.from([
      ...a.distance,
      ...b.distance.map((d) => d + a.distance.at(-1)!),
    ])
    const valid = Uint8Array.from([...a.valid, ...b.valid])
    valid[a.valid.length] = 0
    expect(secondsAt(distanceBests(distance, valid), 5000)).toBeCloseTo(1250, 6)
  })

  it('returns nothing for an empty stream', () => {
    expect(distanceBests(new Float64Array(0), new Uint8Array(0))).toEqual([])
  })
})
