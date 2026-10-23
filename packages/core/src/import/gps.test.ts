import { describe, expect, it } from 'vitest'
import { haversineM, trackFromFixes, type GpsFix } from './gps'

const EARTH_R = 6_371_008.8
const DEG = 180 / Math.PI
const LAT0 = 48
const LON0 = 2
const COS0 = Math.cos((LAT0 * Math.PI) / 180)
const T0 = Date.UTC(2026, 0, 1)
const RUN_MAX_MS = 12.5

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  let u = 0
  while (u === 0) u = rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function fixAt(s: number, northM: number, eastM = 0): GpsFix {
  return {
    t: T0 + s * 1000,
    lat: LAT0 + (northM / EARTH_R) * DEG,
    lon: LON0 + (eastM / (EARTH_R * COS0)) * DEG,
  }
}

function seconds(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i)
}

/** One fix per second. northAt gives the true position; noise is added when rand is given. */
function run(
  secs: number[],
  northAt: (s: number) => number,
  rand?: () => number,
  sigmaM = 0,
): GpsFix[] {
  return secs.map((s) => {
    const nN = rand ? sigmaM * gaussian(rand) : 0
    const nE = rand ? sigmaM * gaussian(rand) : 0
    return fixAt(s, northAt(s) + nN, nE)
  })
}

function bestMeanSpeed(t: Float64Array, d: Float64Array, windowMs: number): number {
  let best = 0
  let j = 0
  for (let i = 0; i < t.length; i++) {
    if (j < i) j = i
    while (j + 1 < t.length && t[j]! - t[i]! < windowMs) j++
    if (t[j]! - t[i]! >= windowMs) {
      best = Math.max(best, (d[j]! - d[i]!) / ((t[j]! - t[i]!) / 1000))
    }
  }
  return best
}

const OPTS = { maxSpeedMs: RUN_MAX_MS }

describe('haversineM', () => {
  it('matches Paris to London within 0.5%', () => {
    const d = haversineM(48.8566, 2.3522, 51.5074, -0.1278)
    expect(Math.abs(d - 343_500) / 343_500).toBeLessThan(0.005)
  })
})

describe('trackFromFixes', () => {
  it('returns empty arrays for no fixes', () => {
    const track = trackFromFixes([], OPTS)
    expect(track.tMs.length).toBe(0)
    expect(track.distanceM.length).toBe(0)
    expect(track.speedMs.length).toBe(0)
    expect(track.rejected).toBe(0)
  })

  it('measures a straight constant-speed line', () => {
    const fixes = run(seconds(0, 1800), (s) => 3 * s)
    const track = trackFromFixes(fixes, OPTS)
    const expected = 3 * 1799
    expect(
      Math.abs(track.distanceM[track.distanceM.length - 1]! - expected) / expected,
    ).toBeLessThan(0.005)
    for (const v of track.speedMs) expect(Math.abs(v - 3) / 3).toBeLessThan(0.01)
    expect(track.rejected).toBe(0)
  })

  it('reports no motion for 30 min standing still with 2.5 m noise', () => {
    const fixes = run(seconds(0, 1800), () => 0, mulberry32(1), 2.5)
    const track = trackFromFixes(fixes, OPTS)
    expect(track.distanceM[track.distanceM.length - 1]!).toBeLessThan(100)
    expect(Math.max(...track.speedMs)).toBeLessThan(1)
  })

  it('keeps distance and best 60 s pace accurate for 3 m/s with 2.5 m noise', () => {
    const fixes = run(seconds(0, 1800), (s) => 3 * s, mulberry32(2), 2.5)
    const track = trackFromFixes(fixes, OPTS)
    const expected = 3 * 1799
    const distance = track.distanceM[track.distanceM.length - 1]!
    expect(Math.abs(distance - expected) / expected).toBeLessThan(0.02)
    const best = bestMeanSpeed(track.tMs, track.distanceM, 60_000)
    expect(Math.abs(best - 3) / 3).toBeLessThan(0.03)
  })

  it('never decreases distance', () => {
    const fixes = run(seconds(0, 1800), () => 0, mulberry32(3), 2.5)
    const { distanceM } = trackFromFixes(fixes, OPTS)
    for (let i = 1; i < distanceM.length; i++) {
      expect(distanceM[i]!).toBeGreaterThanOrEqual(distanceM[i - 1]!)
    }
  })

  it('ignores a (0,0) fix', () => {
    const base = run(seconds(0, 600), (s) => 3 * s)
    const baseline = trackFromFixes(base, OPTS)
    const withZero = [
      ...base.slice(0, 300),
      { t: base[299]!.t + 500, lat: 0, lon: 0 },
      ...base.slice(300),
    ]
    const track = trackFromFixes(withZero, OPTS)
    const expected = baseline.distanceM[baseline.distanceM.length - 1]!
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
    expect(track.rejected).toBe(1)
  })

  it('rejects a 500 m spike on a 3 m/s run', () => {
    const base = run(seconds(0, 600), (s) => 3 * s)
    const baseline = trackFromFixes(base, OPTS)
    const spiked = base.map((f, i) => (i === 300 ? fixAt(i, 3 * i + 500) : f))
    const track = trackFromFixes(spiked, OPTS)
    const expected = baseline.distanceM[baseline.distanceM.length - 1]!
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(track.rejected).toBe(1)
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
  })

  it('sorts unsorted input and drops duplicate times', () => {
    const base = run(seconds(0, 600), (s) => 3 * s)
    const baseline = trackFromFixes(base, OPTS)
    const rand = mulberry32(4)
    const extra = base.filter((_, i) => i % 30 === 0)
    const shuffled = [...base, ...extra]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    const track = trackFromFixes(shuffled, OPTS)
    expect(track.rejected).toBe(extra.length)
    expect(Array.from(track.tMs)).toEqual(Array.from(baseline.tMs))
    expect(track.distanceM[track.distanceM.length - 1]!).toBeCloseTo(
      baseline.distanceM[baseline.distanceM.length - 1]!,
      6,
    )
  })

  it('does not credit distance or smooth speed across a 5 min gap', () => {
    const first = run(seconds(0, 600), (s) => 3 * s)
    const second = run(seconds(899, 1499), (s) => 3 * 899 + 6 * (s - 899))
    const track = trackFromFixes([...first, ...second], OPTS)
    const expected = 3 * 599 + 6 * 599
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(track.rejected).toBe(0)
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
    expect(Math.abs(track.speedMs[599]! - 3) / 3).toBeLessThan(0.01)
    expect(Math.abs(track.speedMs[600]! - 6) / 6).toBeLessThan(0.01)
  })

  it('recovers from a 500 m outlier as the very first fix', () => {
    const clean = run(seconds(0, 600), (s) => 3 * s)
    const expected = trackFromFixes(clean, OPTS).distanceM
    const track = trackFromFixes([fixAt(-1, 500), ...clean], OPTS)
    const want = expected[expected.length - 1]!
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(track.rejected).toBe(1)
    expect(Math.abs(actual - want) / want).toBeLessThan(0.005)
  })

  it('keeps a genuine 300 m jump after a 40 s dropout', () => {
    const before = run(seconds(0, 101), (s) => 3 * s)
    const after = run(seconds(141, 401), (s) => 3 * s + 300)
    const track = trackFromFixes([...before, ...after], OPTS)
    const expected = 3 * 100 + 3 * 259
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(track.rejected).toBe(0)
    expect(track.tMs.length).toBe(before.length + after.length)
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
  })

  it('removes a spike accepted across a dropout without dropping the fix before it', () => {
    const before = run(seconds(0, 101), (s) => 3 * s)
    const spike = fixAt(141, 3 * 141 + 500)
    const after = run(seconds(142, 301), (s) => 3 * s)
    const track = trackFromFixes([...before, spike, ...after], OPTS)
    const expected = 3 * 100 + 3 * 158
    const actual = track.distanceM[track.distanceM.length - 1]!
    expect(track.rejected).toBe(1)
    expect(track.tMs.length).toBe(before.length + after.length)
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
  })
})
