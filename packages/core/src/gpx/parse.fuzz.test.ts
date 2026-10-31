import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { encodeGpx } from './encode'
import { parseGpx } from './parse'
import type { ParseResult } from '../import/result'

/** Fixed clock so the date check is the same on every run. */
const NOW_MS = Date.UTC(2026, 9, 22)
const START_MS = Date.UTC(2025, 4, 1, 7, 30, 0)
const HOUR = 3_600_000
// The unit run keeps a small seeded sample. The heavy fuzz (20 times as many files) runs in the simulation job
// (test:sim, through parse.fuzz.sim.test.ts), so a mutation only it finds fails there, not here.
const FUZZ_SCALE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env.FUZZ_SCALE
const FILES = 150 * Number(FUZZ_SCALE ?? 1)
const MAX_SAMPLES = 172_800
const SPEED_LIMIT = { ride: 30, run: 12.5 } as const
const SPLICES = ['<', '>', '&', '"', "'", '/', '![CDATA[', ']]>', '<!--', '-->', '<?', '?>', '\0']

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
  const paused = activity('ride', 900)
  paused.paused.fill(1, 300, 420)
  return [
    encodeGpx(activity('ride', 600)),
    encodeGpx(activity('run', 400), { type: '9' }),
    encodeGpx(paused, { type: 'virtual_ride' }),
    encodeGpx(activity('ride', 200), { type: 'e-bike' }),
    new TextEncoder().encode(
      `<gpx><trk><type>1</type><trkseg><trkpt lat="1" lon="2"><time>${new Date(
        START_MS + HOUR,
      ).toISOString()}</time></trkpt></trkseg></trk></gpx>`,
    ),
  ]
}

/** One mutation: byte flips, truncation, a duplicated chunk, a spliced markup character, or a cut. */
function mutate(bytes: Uint8Array, rng: () => number): Uint8Array {
  const pick = (n: number) => Math.floor(rng() * n)
  const kind = pick(5)
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
  if (kind === 3) {
    const splice = new TextEncoder().encode(SPLICES[pick(SPLICES.length)]!)
    const at = pick(bytes.length)
    return Uint8Array.from([...bytes.slice(0, at), ...splice, ...bytes.slice(at)])
  }
  const out = bytes.slice()
  const from = pick(out.length)
  const cut = Math.min(out.length, from + 1 + pick(256))
  return Uint8Array.from([...out.slice(0, from), ...out.slice(cut)])
}

/** The invariants every returned result must hold, whatever the input. */
function violations(result: ParseResult): string[] {
  if (!result.ok) {
    return typeof result.reason === 'string' && result.reason.length > 0
      ? []
      : ['failure without a reason']
  }
  const problems: string[] = []
  for (const a of result.activities) {
    if (a.n > MAX_SAMPLES) problems.push(`n ${a.n} exceeds ${MAX_SAMPLES}`)
    if (a.startMs < Date.UTC(2000, 0, 1) || a.startMs > NOW_MS + 24 * HOUR) {
      problems.push(`implausible start ${a.startMs}`)
    }
    for (let i = 0; i < a.n; i++) {
      const distance = a.distance[i]!
      if (!Number.isNaN(distance) && distance < 0) problems.push(`negative distance at ${i}`)
      const speed = a.speed[i]!
      if (!Number.isNaN(speed) && speed > SPEED_LIMIT[a.sport]) {
        problems.push(`speed ${speed} above the ${a.sport} limit at ${i}`)
      }
    }
  }
  return problems
}

describe('parseGpx under mutation', () => {
  it('never throws, and returns only plausible results', () => {
    const rng = random(0x6a9e)
    const bases = baseFiles()
    const broken: string[] = []
    let accepted = 0
    for (let i = 0; i < FILES; i++) {
      const base = bases[Math.floor(rng() * bases.length)]!
      const bytes = mutate(base, rng)
      const result = parseGpx(bytes, `fuzz-${i}.gpx`, undefined, { nowMs: NOW_MS })
      const problems = violations(result)
      if (problems.length > 0) broken.push(`file ${i}: ${problems[0]}`)
      if (result.ok) accepted++
    }
    expect(broken).toEqual([])
    // Most mutations break the document, but some survive intact.
    expect(accepted).toBeGreaterThan(0)
  })
})
