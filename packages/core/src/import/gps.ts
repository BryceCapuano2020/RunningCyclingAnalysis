/** A timestamped position. `t` is epoch milliseconds. */
export interface GpsFix {
  t: number
  lat: number
  lon: number
}

/** Speed and distance derived from GPS fixes. Arrays align with the accepted fixes, in time order. */
export interface GpsTrack {
  tMs: Float64Array
  distanceM: Float64Array
  speedMs: Float64Array
  /** Fixes dropped for invalid values, duplicate times, or an implied speed above 2 x maxSpeedMs. */
  rejected: number
}

export const EARTH_RADIUS_M = 6_371_008.8
/** A gap longer than this is a pause: speed is not smoothed across it and no distance is credited. */
const MAX_GAP_MS = 30_000
/** Consecutive fixes that must agree with each other before they replace a disagreeing anchor. */
const MIN_RUN = 3

/** Great-circle distance in metres on a sphere of mean Earth radius (IUGG). */
export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const phi1 = (aLat * Math.PI) / 180
  const phi2 = (bLat * Math.PI) / 180
  const dPhi = phi2 - phi1
  const dLambda = ((bLon - aLon) * Math.PI) / 180
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, h))), Math.sqrt(1 - Math.min(1, h)))
  return EARTH_RADIUS_M * c
}

/**
 * Derives speed and distance from raw GPS fixes. Invalid, duplicate and implausibly fast fixes are
 * dropped first, except that a run of three fixes agreeing with each other replaces an outlier
 * anchor. Speed is a centred difference over a window of halfWindowS on each side, and
 * distance integrates that speed with the trapezoid rule. Throws RangeError on non-positive options.
 */
export function trackFromFixes(
  fixes: GpsFix[],
  opts: { maxSpeedMs: number; halfWindowS?: number; stillSpeedMs?: number },
): GpsTrack {
  const halfWindowS = opts.halfWindowS ?? 10
  const stillSpeedMs = opts.stillSpeedMs ?? 0.5
  if (!(opts.maxSpeedMs > 0) || !(halfWindowS > 0) || !(stillSpeedMs >= 0)) {
    throw new RangeError('trackFromFixes: maxSpeedMs and halfWindowS must be positive')
  }

  const { accepted, rejected } = acceptFixes(fixes, opts.maxSpeedMs)

  const n = accepted.length
  const tMs = new Float64Array(n)
  const distanceM = new Float64Array(n)
  const speedMs = new Float64Array(n)
  for (const [i, fix] of accepted.entries()) tMs[i] = fix.t

  let segStart = 0
  while (segStart < n) {
    let segEnd = segStart
    while (segEnd + 1 < n && tMs[segEnd + 1]! - tMs[segEnd]! <= MAX_GAP_MS) segEnd++
    centredSpeeds(accepted, segStart, segEnd, halfWindowS * 1000, speedMs)
    segStart = segEnd + 1
  }

  for (let i = 0; i < n; i++) {
    if (speedMs[i]! < stillSpeedMs) speedMs[i] = 0
  }

  for (let i = 1; i < n; i++) {
    const dtMs = tMs[i]! - tMs[i - 1]!
    const credit = dtMs <= MAX_GAP_MS ? ((speedMs[i - 1]! + speedMs[i]!) / 2) * (dtMs / 1000) : 0
    distanceM[i] = distanceM[i - 1]! + credit
  }

  return { tMs, distanceM, speedMs, rejected }
}

/**
 * The fixes that are kept, in time order, and how many were dropped: invalid values, repeated
 * times, and fixes implying more than twice maxSpeedMs. A run of three fixes that agree with each
 * other replaces an outlier anchor. The track and the route shape both use these fixes.
 */
export function acceptFixes(
  fixes: GpsFix[],
  maxSpeedMs: number,
): { accepted: GpsFix[]; rejected: number } {
  let rejected = 0
  const valid: GpsFix[] = []
  for (const fix of fixes) {
    if (isValidFix(fix)) valid.push(fix)
    else rejected++
  }

  valid.sort((a, b) => a.t - b.t)
  const sorted: GpsFix[] = []
  for (const fix of valid) {
    const last = sorted[sorted.length - 1]
    if (last && last.t === fix.t) rejected++
    else sorted.push(fix)
  }

  const accepted: GpsFix[] = []
  const pending: GpsFix[] = []
  const maxStepSpeedMs = 2 * maxSpeedMs
  const implausible = (a: GpsFix, b: GpsFix): boolean =>
    haversineM(a.lat, a.lon, b.lat, b.lon) > maxStepSpeedMs * ((b.t - a.t) / 1000)

  for (const fix of sorted) {
    const anchor = accepted[accepted.length - 1]
    if (!anchor || !implausible(anchor, fix)) {
      rejected += pending.length
      pending.length = 0
      accepted.push(fix)
      continue
    }
    const prev = pending[pending.length - 1]
    if (prev && implausible(prev, fix)) {
      rejected += pending.length
      pending.length = 0
    }
    pending.push(fix)
    if (pending.length < MIN_RUN) continue
    const first = pending[0]!
    if (first.t - anchor.t > MAX_GAP_MS) {
      rejected++
      pending.shift()
      continue
    }
    // The run agrees with itself but not with the anchor, so the anchor is the outlier. Drop it,
    // and drop earlier fixes back to the last gap that disagree with the run.
    accepted.pop()
    rejected++
    let next = anchor
    while (accepted.length > 0) {
      const top = accepted[accepted.length - 1]!
      if (next.t - top.t > MAX_GAP_MS || !implausible(top, first)) break
      accepted.pop()
      rejected++
      next = top
    }
    accepted.push(...pending)
    pending.length = 0
  }
  rejected += pending.length
  return { accepted, rejected }
}

function isValidFix(fix: GpsFix): boolean {
  return Number.isFinite(fix.t) && isUsableLatLon(fix.lat, fix.lon)
}

/**
 * Whether a latitude and longitude locate a point: finite, within range, and not the (0,0) that
 * a device writes when it has no fix. Parsers use it to decide whether a file has positions.
 */
export function isUsableLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  )
}

/**
 * Writes the centred-difference speed of fixes s0..s1 (inclusive) into out. Each fix uses the
 * fixes nearest to its window edges. Near a segment edge the window is one-sided and up to 2H long.
 * Both edges move forward monotonically, so two pointers give linear time.
 */
function centredSpeeds(
  fixes: GpsFix[],
  s0: number,
  s1: number,
  halfMs: number,
  out: Float64Array,
): void {
  const t0 = fixes[s0]!.t
  const t1 = fixes[s1]!.t
  const windowMs = 2 * halfMs
  let lo = s0
  let hi = s0
  for (let i = s0; i <= s1; i++) {
    const ti = fixes[i]!.t
    const a = Math.max(t0, Math.min(ti - halfMs, t1 - windowMs))
    const b = Math.min(t1, Math.max(ti + halfMs, t0 + windowMs))
    lo = nearestFrom(fixes, lo, s1, a)
    hi = nearestFrom(fixes, hi, s1, b)
    const dtMs = fixes[hi]!.t - fixes[lo]!.t
    out[i] =
      dtMs > 0
        ? haversineM(fixes[lo]!.lat, fixes[lo]!.lon, fixes[hi]!.lat, fixes[hi]!.lon) / (dtMs / 1000)
        : 0
  }
}

/** Advances p while the next fix is at least as close to target. Times are sorted, so this stops at the nearest. */
function nearestFrom(fixes: GpsFix[], p: number, last: number, target: number): number {
  let q = p
  while (q < last && Math.abs(fixes[q + 1]!.t - target) <= Math.abs(fixes[q]!.t - target)) q++
  return q
}
