import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { parseTcx } from './parse'
import type { ParseResult } from '../import/result'
import { encodeTcx } from './encode'

/** Fixed clock so the date check is the same on every run. */
const NOW_MS = Date.UTC(2026, 9, 22)
const START_MS = Date.UTC(2025, 4, 1, 7, 30, 0)
const HOUR = 3_600_000
// The unit run keeps a small seeded sample. The heavy fuzz (20 times as many files) runs in the simulation job
// (test:sim, through parse.fuzz.sim.test.ts), so a mutation only it finds fails there, not here.
const FILES = 150 * Number(process.env.FUZZ_SCALE ?? 1)
const MAX_SAMPLES = 172_800
const SPEED_LIMIT = { ride: 30, run: 12.5 } as const

/** A seeded PRNG (mulberry32): the same mutations on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function activity(sport: Sport, n: number): Activity {
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const heartRate = new Float64Array(n)
  const power = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    speed[i] = sport === 'run' ? 3 + (i % 5) * 0.4 : 7 + (i % 9) * 0.5
    total += speed[i]!
    distance[i] = total
    altitude[i] = 100 + (i % 40)
    heartRate[i] = 120 + (i % 40)
    power[i] = sport === 'run' ? NaN : 150 + (i % 60)
  }
  return {
    id: 'base',
    name: 'base',
    sport,
    startMs: START_MS,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused: new Uint8Array(n),
    hasPower: sport === 'ride',
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

/** Well-formed files of several shapes, for the mutations to start from. */
function baseFiles(): Uint8Array[] {
  const withPause = activity('run', 400)
  withPause.paused.fill(1, 100, 200)
  return [
    encodeTcx(activity('ride', 600), { gps: true }),
    encodeTcx(activity('run', 400)),
    encodeTcx(withPause),
    encodeTcx({ ...activity('ride', 300), startMs: START_MS + HOUR }, { gps: true }),
  ]
}

/** One mutation of a file: byte flips, truncation, a duplicated chunk, or header edits. */
function mutate(bytes: Uint8Array, rng: () => number): Uint8Array {
  const pick = (n: number) => Math.floor(rng() * n)
  const kind = pick(4)
  if (kind === 0) {
    const out = bytes.slice()
    for (let k = 1 + pick(8); k > 0; k--) {
      const at = pick(out.length)
      out[at] = out[at]! ^ (1 << pick(8))
    }
    return out
  }
  if (kind === 1) return bytes.slice(0, pick(bytes.length + 1))
  if (kind === 2) {
    const from = pick(bytes.length)
    const length = 1 + pick(Math.min(512, bytes.length - from))
    const chunk = bytes.slice(from, from + length)
    const at = pick(bytes.length)
    return Uint8Array.from([...bytes.slice(0, at), ...chunk, ...chunk, ...bytes.slice(at)])
  }
  const out = bytes.slice()
  for (let k = 1 + pick(3); k > 0; k--) {
    const at = pick(Math.min(40, out.length))
    out[at] = pick(256)
  }
  return out
}

/** The invariants every returned activity must hold, whatever the input. */
function violations(result: ParseResult): string[] {
  if (!result.ok) return []
  const problems: string[] = []
  for (const a of result.activities) {
    if (a.n > MAX_SAMPLES) problems.push(`n ${a.n} exceeds ${MAX_SAMPLES}`)
    if (a.startMs < Date.UTC(2000, 0, 1) || a.startMs > NOW_MS + 24 * HOUR) {
      problems.push(`implausible start ${a.startMs}`)
    }
    for (let i = 0; i < a.n; i++) {
      if (a.distance[i]! < 0) problems.push(`negative distance at ${i}`)
      const speed = a.speed[i]!
      if (!Number.isNaN(speed) && speed > SPEED_LIMIT[a.sport]) {
        problems.push(`speed ${speed} above the ${a.sport} limit at ${i}`)
      }
    }
  }
  return problems
}

describe('parseTcx under mutation', () => {
  it('never throws, and returns only plausible activities', () => {
    const rng = random(0x7c7c)
    const bases = baseFiles()
    const broken: string[] = []
    let accepted = 0
    for (let i = 0; i < FILES; i++) {
      const base = bases[Math.floor(rng() * bases.length)]!
      const bytes = mutate(base, rng)
      const result = parseTcx(bytes, `fuzz-${i}.tcx`, undefined, { nowMs: NOW_MS })
      const problems = violations(result)
      if (problems.length > 0) broken.push(`file ${i}: ${problems[0]}`)
      if (result.ok) accepted++
    }
    expect(broken).toEqual([])
    // Most mutations break the XML or the data; some leave a valid document.
    expect(accepted).toBeGreaterThan(0)
  })

  it('never throws on random bytes', () => {
    const rng = random(0xbeef)
    for (let i = 0; i < 300; i++) {
      const length = Math.floor(rng() * 400)
      const bytes = Uint8Array.from({ length }, () => Math.floor(rng() * 256))
      expect(violations(parseTcx(bytes, `noise-${i}.tcx`, undefined, { nowMs: NOW_MS }))).toEqual(
        [],
      )
    }
  })
})
