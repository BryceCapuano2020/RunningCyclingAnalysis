/** Distance and speed from a TCX file's DistanceMeters, for the Trackpoints that carry it. */

/** Speed from DistanceMeters: a centred difference over this window on each side, as in gps.ts. */
const HALF_WINDOW_MS = 10_000
const STILL_SPEED_MS = 0.5
/** A gap longer than this starts a new segment, as in gps.ts. */
const MAX_GAP_MS = 30_000
/** A DistanceMeters drop smaller than this is sensor jitter. A larger one is a lap reset. */
const RESET_M = 1

/**
 * Cumulative distance from DistanceMeters, or undefined when no point has it. A drop of at least
 * RESET_M is a lap reset: the total so far becomes an offset and the count continues from it. A
 * smaller drop is jitter, so the total stays where it was.
 */
export function recordedDistance(
  points: readonly { distance?: number | undefined }[],
): (number | undefined)[] | undefined {
  if (!points.some((p) => p.distance !== undefined)) return undefined
  const out: (number | undefined)[] = []
  let offset = 0
  let raw: number | undefined
  let total = 0
  for (const p of points) {
    const d = p.distance
    if (d === undefined) {
      out.push(undefined)
      continue
    }
    if (raw === undefined || d >= raw) {
      raw = d
    } else if (raw - d < RESET_M) {
      out.push(total)
      continue
    } else {
      offset = total
      raw = d
    }
    total = offset + d
    out.push(total)
  }
  return out
}

/** Speed from cumulative distance, over the points that have one. Undefined where they do not. */
export function speedFromDistance(
  points: readonly { tMs: number }[],
  distance: (number | undefined)[],
): (number | undefined)[] {
  const index: number[] = []
  const times: number[] = []
  const totals: number[] = []
  points.forEach((p, i) => {
    const d = distance[i]
    if (d === undefined) return
    index.push(i)
    times.push(p.tMs)
    totals.push(d)
  })
  const speeds = centredSpeeds(times, totals)
  const out: (number | undefined)[] = points.map(() => undefined)
  index.forEach((pointIndex, k) => {
    out[pointIndex] = speeds[k]
  })
  return out
}

/** Centred-difference speeds, split into segments at gaps longer than MAX_GAP_MS. */
function centredSpeeds(tMs: number[], totals: number[]): number[] {
  const out = tMs.map(() => 0)
  let s0 = 0
  while (s0 < tMs.length) {
    let s1 = s0
    while (s1 + 1 < tMs.length && tMs[s1 + 1]! - tMs[s1]! <= MAX_GAP_MS) s1++
    centredSegment(tMs, totals, s0, s1, out)
    s0 = s1 + 1
  }
  return out.map((v) => (v < STILL_SPEED_MS ? 0 : v))
}

/**
 * Writes the centred speed of points s0..s1 (inclusive) into out. Each point uses the points
 * nearest to its window edges, so a point near the segment edge gets a one-sided window.
 */
function centredSegment(
  tMs: number[],
  totals: number[],
  s0: number,
  s1: number,
  out: number[],
): void {
  const t0 = tMs[s0]!
  const t1 = tMs[s1]!
  let lo = s0
  let hi = s0
  for (let i = s0; i <= s1; i++) {
    const ti = tMs[i]!
    const from = Math.max(t0, Math.min(ti - HALF_WINDOW_MS, t1 - 2 * HALF_WINDOW_MS))
    const to = Math.min(t1, Math.max(ti + HALF_WINDOW_MS, t0 + 2 * HALF_WINDOW_MS))
    lo = nearestFrom(tMs, lo, s1, from)
    hi = nearestFrom(tMs, hi, s1, to)
    const dt = tMs[hi]! - tMs[lo]!
    out[i] = dt > 0 ? ((totals[hi]! - totals[lo]!) * 1000) / dt : 0
  }
}

/** Advances p while the next time is at least as close to target. Times are sorted. */
function nearestFrom(tMs: number[], p: number, last: number, target: number): number {
  let q = p
  while (q < last && Math.abs(tMs[q + 1]! - target) <= Math.abs(tMs[q]! - target)) q++
  return q
}
