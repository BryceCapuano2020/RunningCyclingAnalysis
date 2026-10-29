import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { mulberry32 } from '../math'
import type { Sport } from '../types'
import { implausibleSpeedStretches, sustainedSpeedCeiling } from './sustainedSpeed'

/** The scan as it was before the shortcut: every duration at every start. */
function referenceStretches(activity: { n: number; speed: Float64Array; sport: Sport }) {
  const { n, speed, sport } = activity
  const sum = new Float64Array(n + 1)
  const unknown = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const known = Number.isFinite(v)
    sum[i + 1] = sum[i]! + (known ? v : 0)
    unknown[i + 1] = unknown[i]! + (known ? 0 : 1)
  }
  const covered = new Int32Array(n + 1)
  for (const durationS of DURATIONS_S) {
    if (durationS > n) break
    const limit = sustainedSpeedCeiling(sport, durationS) * durationS
    for (let start = 0; start + durationS <= n; start++) {
      const end = start + durationS
      if (unknown[end]! - unknown[start]! > 0 || sum[end]! - sum[start]! <= limit) continue
      covered[start] = covered[start]! + 1
      covered[end] = covered[end]! - 1
    }
  }
  const stretches: { start: number; end: number }[] = []
  let depth = 0
  let open = -1
  for (let i = 0; i <= n; i++) {
    depth += covered[i]!
    if (depth > 0 && open < 0) open = i
    if (depth <= 0 && open >= 0) {
      stretches.push({ start: open, end: i })
      open = -1
    }
  }
  return stretches
}

describe('implausibleSpeedStretches against the scan without the shortcut', () => {
  it('finds the same stretches on random speeds, gaps and fast bursts, for both sports', () => {
    const rand = mulberry32(21)
    let flagged = 0
    for (let trial = 0; trial < 60; trial++) {
      const sport: Sport = trial % 2 === 0 ? 'run' : 'ride'
      const n = 200 + Math.floor(rand() * 5000)
      const base = sport === 'run' ? 2.5 + rand() * 3 : 6 + rand() * 6
      const speed = Float64Array.from({ length: n }, () => Math.max(0, base + (rand() - 0.5) * 3))
      for (let burst = 0; burst < Math.floor(rand() * 4); burst++) {
        const start = Math.floor(rand() * n)
        const length = 1 + Math.floor(rand() * 900)
        speed.fill((sport === 'run' ? 8 : 20) + rand() * 25, start, Math.min(n, start + length))
      }
      for (let gap = 0; gap < Math.floor(rand() * 5); gap++) speed[Math.floor(rand() * n)] = NaN
      const activity = { n, speed, sport }
      const expected = referenceStretches(activity)
      flagged += expected.length
      expect(implausibleSpeedStretches(activity)).toEqual(expected)
    }
    expect(flagged).toBeGreaterThan(0)
  })

  it('finds the same stretch when the fastest speed sits exactly on a ceiling', () => {
    for (const sport of ['run', 'ride'] as const) {
      for (const durationS of [60, 300, 1200]) {
        const n = durationS + 50
        const speed = new Float64Array(n).fill(2)
        speed.fill(sustainedSpeedCeiling(sport, durationS), 10, 10 + durationS)
        const activity = { n, speed, sport }
        expect(implausibleSpeedStretches(activity)).toEqual(referenceStretches(activity))
      }
    }
  })
})
