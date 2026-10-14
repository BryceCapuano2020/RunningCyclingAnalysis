import type { Effort, Terrain } from './spec'

/** Grade (rise over run) at a horizontal distance, m, and elapsed second. */
export type GradeFn = (distance: number, t: number) => number

/** Half-open sample range [start, end). */
export interface Window {
  start: number
  end: number
}

const TWO_PI = 2 * Math.PI
/** Time constant of the metabolic response to a change in target, s. */
const LAG_S = 10
/** Ramp into a held test effort starts this long before the effort, s. */
const RAMP_S = 30
const WARMUP_S = 600
const COOLDOWN_S = 300
const INTERVAL_CYCLE_S = 420
const INTERVAL_HARD_S = 240
const TEST_WARMUP_S = 900
const TEST_RECOVERY_S = 600
const TEST_EFFORTS_S = [180, 360, 720, 1200]
const CLIMB_FLAT_S = 300
const CLIMB_END_FRACTION = 0.6

function fill(out: Float64Array, from: number, to: number, value: number): void {
  for (let i = Math.max(0, from); i < Math.min(to, out.length); i++) out[i] = value
}

/**
 * Test efforts in order, each exactly its duration. An effort that would end after the activity
 * is dropped, together with everything after it.
 */
function testEffortWindows(n: number): Window[] {
  const windows: Window[] = []
  let cursor = Math.min(n, TEST_WARMUP_S)
  for (let k = 0; k < TEST_EFFORTS_S.length; k++) {
    const start = k === 0 ? cursor : cursor + TEST_RECOVERY_S
    const end = start + TEST_EFFORTS_S[k]!
    if (end > n) break
    windows.push({ start, end })
    cursor = end
  }
  return windows
}

/** Windows whose target is held exactly, so their means equal the target. Only test efforts. */
export function holdWindows(effort: Effort, n: number): Window[] {
  return effort === 'test' ? testEffortWindows(n) : []
}

/**
 * True gross metabolic power before the response lag, W/kg. Only the easy wander draws from
 * `rand`.
 */
export function rawTarget(
  effort: Effort,
  cp: number,
  wPrime: number,
  n: number,
  rand: () => number,
): Float64Array {
  const out = new Float64Array(n)
  switch (effort) {
    case 'easy': {
      const a = rand() * TWO_PI
      const b = rand() * TWO_PI
      for (let t = 0; t < n; t++) {
        const wander = 0.035 * Math.sin((TWO_PI * t) / 600 + a)
        const slower = 0.015 * Math.sin((TWO_PI * t) / 1700 + b)
        out[t] = 0.65 * cp * (1 + wander + slower)
      }
      break
    }
    case 'tempo': {
      fill(out, 0, n, 0.88 * cp)
      fill(out, 0, WARMUP_S, 0.6 * cp)
      fill(out, n - COOLDOWN_S, n, 0.55 * cp)
      break
    }
    case 'intervals': {
      for (let t = WARMUP_S; t < n; t++) {
        const inCycle = (t - WARMUP_S) % INTERVAL_CYCLE_S
        out[t] = inCycle < INTERVAL_HARD_S ? 1.05 * cp : 0.5 * cp
      }
      fill(out, 0, WARMUP_S, 0.6 * cp)
      fill(out, n - COOLDOWN_S, n, 0.55 * cp)
      break
    }
    case 'test': {
      fill(out, 0, n, 0.55 * cp)
      fill(out, 0, TEST_WARMUP_S, 0.6 * cp)
      let previousEnd = Math.min(n, TEST_WARMUP_S)
      for (const { start, end } of testEffortWindows(n)) {
        fill(out, previousEnd, start, 0.5 * cp)
        fill(out, start, end, cp + wPrime / (end - start))
        previousEnd = end
      }
      break
    }
  }
  return out
}

/**
 * First-order lag, time constant 10 s, starting from the first target. Inside each hold window
 * the output equals the raw target exactly. The output ramps smoothly into a hold over the
 * RAMP_S seconds before it starts, so the ramp is complete when the hold begins.
 */
export function applyLag(raw: Float64Array, holds: readonly Window[] = []): Float64Array {
  const n = raw.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const alpha = 1 - Math.exp(-1 / LAG_S)
  out[0] = raw[0]!
  for (let i = 1; i < n; i++) {
    out[i] = out[i - 1]! + alpha * (raw[i]! - out[i - 1]!)
  }
  for (const { start, end } of holds) {
    const rampStart = Math.max(0, start - RAMP_S)
    const rampLength = start - rampStart
    const from = rampStart > 0 ? out[rampStart - 1]! : raw[0]!
    const target = raw[start]!
    for (let t = rampStart; t < start; t++) {
      const u = (t - rampStart) / rampLength
      out[t] = from + (target - from) * u * u * (3 - 2 * u)
    }
    for (let t = start; t < Math.min(end, n); t++) out[t] = raw[t]!
  }
  return out
}

/**
 * Gradient profile for a terrain. Rolling depends on distance. The climb is timed in elapsed
 * seconds because its breakpoints are defined as durations and a fraction of the activity.
 */
export function gradeFunction(terrain: Terrain, n: number, rand: () => number): GradeFn {
  switch (terrain) {
    case 'flat':
      return () => 0
    case 'rolling': {
      const phaseShort = rand() * TWO_PI
      const phaseLong = rand() * TWO_PI
      return (distance) =>
        0.025 * Math.sin((TWO_PI * distance) / 900 + phaseShort) +
        0.015 * Math.sin((TWO_PI * distance) / 2300 + phaseLong)
    }
    case 'climb': {
      const phase = rand() * TWO_PI
      const climbEnd = CLIMB_END_FRACTION * n
      return (_distance, t) => {
        if (t < CLIMB_FLAT_S) return 0
        if (t < climbEnd) return 0.065 + 0.005 * Math.sin((TWO_PI * t) / 900 + phase)
        return -0.05
      }
    }
  }
}
