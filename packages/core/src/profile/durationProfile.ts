import {
  PROFILE_ANCHOR_S,
  PROFILE_FLOOR_S,
  PROFILE_LONG_S,
  PROFILE_MAX_S,
  PROFILE_MEASUREMENT_ERROR,
  PROFILE_MIN_DURATIONS,
  PROFILE_MIN_S,
  PROFILE_MIN_SESSIONS,
  PROFILE_SHORT_S,
  PROFILE_Z_90,
} from './constants'
import { fitCurve } from './morton'

/** One duration's best, in the sport's own unit, and the session it was set in. */
export interface ProfilePoint {
  durationS: number
  value: number
  /** The activity, or the file holding several, the best came from; null when it is not known. */
  sessionId: string | null
}

export type StandsOut = 'above' | 'below'

/** How one duration's best sits against what the other durations predict. */
export interface ProfileRow {
  durationS: number
  /** The best over what the other bests predict, less one: 0.14 is 14% above. */
  residual: number
  /** The 90% interval of the residual, which allows for the fit and for measurement error. */
  low: number
  high: number
  /** Set only when the interval leaves zero. */
  standsOut: StandsOut | null
}

/** What a profile still needs: five durations, a short best, a long best, or a second session. */
export type ProfileGap = 'durations' | 'short' | 'long' | 'sessions'

export interface ReadyProfile {
  status: 'ready'
  rows: ProfileRow[]
  /** False without a best at 15 s or under: Pmax is not inferred, and only 2 min and over are shown. */
  anchored: boolean
}

export type DurationProfile = ReadyProfile | { status: 'missing'; missing: ProfileGap[] }

const inRange = (point: ProfilePoint): boolean =>
  Number.isFinite(point.value) &&
  point.value > 0 &&
  point.durationS >= PROFILE_MIN_S &&
  point.durationS <= PROFILE_MAX_S

/** What the curve lacks, in a fixed order; empty when it has all that a profile needs. */
function gapsOf(points: readonly ProfilePoint[]): ProfileGap[] {
  const sessions = new Set(
    points.flatMap((point) => (point.sessionId === null ? [] : [point.sessionId])),
  )
  const lacking: [ProfileGap, boolean][] = [
    ['durations', new Set(points.map((p) => p.durationS)).size < PROFILE_MIN_DURATIONS],
    ['short', !points.some((point) => point.durationS <= PROFILE_SHORT_S)],
    ['long', !points.some((point) => point.durationS >= PROFILE_LONG_S)],
    ['sessions', sessions.size < PROFILE_MIN_SESSIONS],
  ]
  return lacking.filter(([, isLacking]) => isLacking).map(([gap]) => gap)
}

/**
 * Each duration's best over what the other durations predict, less one, or null where the others give
 * no valid curve. The curve is fitted without that duration and read at it.
 */
function leaveOneOut(points: readonly ProfilePoint[], pmax: boolean): (number | null)[] {
  return points.map((point, i) => {
    const others = points.filter((_, j) => j !== i)
    const predicted = fitCurve(others, pmax)?.(point.durationS)
    return predicted !== undefined && predicted > 0 ? point.value / predicted - 1 : null
  })
}

/** Root mean square of the residuals other than the one at `skip`. */
function rmsWithout(residuals: readonly number[], skip: number): number {
  const others = residuals.filter((_, j) => j !== skip)
  return Math.sqrt(others.reduce((sum, r) => sum + r * r, 0) / others.length)
}

function rowOf(durationS: number, residuals: readonly number[], index: number): ProfileRow {
  const residual = residuals[index]!
  // The spread of the other durations' errors, with the meter's own error added in quadrature.
  const spread = Math.hypot(rmsWithout(residuals, index), PROFILE_MEASUREMENT_ERROR)
  const half = PROFILE_Z_90 * spread
  const low = residual - half
  const high = residual + half
  return {
    durationS,
    residual,
    low,
    high,
    standsOut: low > 0 ? 'above' : high < 0 ? 'below' : null,
  }
}

/**
 * Which durations of one sport's best curve stand out from the rest of it, 5 s to 60 min.
 *
 * Each duration is predicted from the others with Morton's three-parameter critical-power model, fitted
 * on log values (see docs/research/duration-profile.md), and its best is compared with that. A duration
 * stands out when the interval round the difference excludes zero. The result is a fact about the
 * curve, not about the athlete's capability: a best is a lower bound, so one far below the rest may be
 * untried.
 */
export function durationProfile(curve: readonly ProfilePoint[]): DurationProfile {
  const points = curve.filter(inRange).sort((a, b) => a.durationS - b.durationS)
  const missing = gapsOf(points)
  if (missing.length > 0) return { status: 'missing', missing }
  const anchored = points.some((point) => point.durationS <= PROFILE_ANCHOR_S)
  const shown = anchored ? points : points.filter((point) => point.durationS >= PROFILE_FLOOR_S)
  const found = leaveOneOut(shown, anchored)
  const fitted = shown.flatMap((point, i) =>
    found[i] === null ? [] : [{ durationS: point.durationS, residual: found[i]! }],
  )
  if (fitted.length < PROFILE_MIN_DURATIONS) return { status: 'missing', missing: ['durations'] }
  const residuals = fitted.map(({ residual }) => residual)
  return {
    status: 'ready',
    rows: fitted.map(({ durationS }, i) => rowOf(durationS, residuals, i)),
    anchored,
  }
}
