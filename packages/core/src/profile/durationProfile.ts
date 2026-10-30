import {
  PROFILE_ANCHOR_S,
  PROFILE_FLOOR_S,
  PROFILE_LONG_S,
  PROFILE_MAX_S,
  PROFILE_MIN_DURATIONS,
  PROFILE_MIN_S,
  PROFILE_MIN_SESSIONS,
  shortEndOf,
  PROFILE_ALPHA,
  PROFILE_IN_LINE_MIN_ACTIVITIES,
} from './constants'
import { fitCurve } from './morton'
import { studentTQuantile } from './studentT'
import { conditionalEstimate } from './winnersCurse'

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
  /** The shortest duration the profile reads, s: 5 s for a ride, 3 min for a run. */
  startS: number
  /** The athlete's activities of the sport behind the bests, which the sentence needs PROFILE_IN_LINE_MIN_ACTIVITIES of to say they agree. */
  activities: number
}

/**
 * A profile, or what it lacks. 'unfit' is a curve with all it needs that no model could be fitted to well
 * enough to compare each duration with, which is not the same as a duration missing.
 */
export type DurationProfile =
  ReadyProfile | { status: 'missing'; missing: ProfileGap[] } | { status: 'unfit' }

const inRange = (startS: number) => (point: ProfilePoint) =>
  Number.isFinite(point.value) &&
  point.value > 0 &&
  point.durationS >= startS &&
  point.durationS <= PROFILE_MAX_S

/**
 * What the curve lacks, in a fixed order; empty when it has all that a profile needs. The two ends are
 * asked of every best the athlete has, but the durations and the sessions are counted over `shown`, the
 * points the profile is made from.
 */
function gapsOf(
  points: readonly ProfilePoint[],
  shown: readonly ProfilePoint[],
  startS: number,
): ProfileGap[] {
  const sessions = new Set(
    shown.flatMap((point) => (point.sessionId === null ? [] : [point.sessionId])),
  )
  const lacking: [ProfileGap, boolean][] = [
    ['durations', new Set(shown.map((p) => p.durationS)).size < PROFILE_MIN_DURATIONS],
    ['short', !points.some((point) => point.durationS <= shortEndOf(startS))],
    ['long', !points.some((point) => point.durationS >= PROFILE_LONG_S)],
    ['sessions', sessions.size < PROFILE_MIN_SESSIONS],
  ]
  return lacking.filter(([, isLacking]) => isLacking).map(([gap]) => gap)
}

/** One duration's best against the curve fitted without it. */
interface Held {
  durationS: number
  /** ln(best / predicted). */
  logRatio: number
  /** The spread of a new best about the curve, on the log scale, and the fit's degrees of freedom. */
  sd: number
  df: number
}

/**
 * Each duration's best against what the other durations predict. The curve is fitted without that
 * duration and read at it. A duration is left out when the others give no valid curve, and when they
 * hold no best at 15 s or under for a curve with Pmax: it would be read far beyond the data, where the
 * model can say anything.
 */
function leaveOneOut(points: readonly ProfilePoint[], pmax: boolean): Held[] {
  return points.flatMap((point, i) => {
    const others = points.filter((_, j) => j !== i)
    if (pmax && !others.some((other) => other.durationS <= PROFILE_ANCHOR_S)) return []
    const fit = fitCurve(others, pmax)
    const predicted = fit?.predict(point.durationS)
    if (fit === null || predicted === undefined || !(predicted > 0)) return []
    return [
      {
        durationS: point.durationS,
        logRatio: Math.log(point.value / predicted),
        sd: fit.sd.at(point.durationS),
        df: fit.sd.df,
      },
    ]
  })
}

/**
 * The level a profile is judged at, spread over its rows. PROFILE_ALPHA is for a library of
 * PROFILE_IN_LINE_MIN_ACTIVITIES activities or more; a smaller one has fewer efforts behind each best, whose spread
 * the fit's few points and the meter's floor understate, so its level is cut in proportion and a stand-out in a
 * small library is rarer and surer.
 */
function levelFor(activities: number): number {
  return PROFILE_ALPHA * Math.min(1, Math.max(activities, 1) / PROFILE_IN_LINE_MIN_ACTIVITIES)
}

/** The least a stand-out's drawn half-width may be, as a share of its interval's half-width. */
const MIN_BAR_HALF_SHARE = 0.25

/**
 * A row from a held duration. Its interval is the log ratio plus and minus a Student's t quantile times its own
 * spread, so a duration the others pin down poorly has a wide one. The level is `levelFor` over all the rows
 * (Bonferroni), so that a profile of pure noise stands out somewhere that rarely.
 *
 * A duration that stands out was picked for standing out, so the size it states is corrected for that
 * (`conditionalEstimate`: the size the flagged draws are centred on), never within a quarter of the interval's half-width of its near end and never
 * above the draw. The bar drawn is then centred on the stated size, from the near end to its mirror, so the point and
 * its bar agree and the bar still excludes zero. A duration in line states its ratio and the interval as they are.
 */
function rowOf(
  held: Held,
  rows: number,
  quantiles: Map<number, number>,
  level: number,
): ProfileRow {
  const t = quantiles.get(held.df) ?? studentTQuantile(1 - level / (2 * rows), held.df)
  quantiles.set(held.df, t)
  const half = t * held.sd
  const lowLog = held.logRatio - half
  const highLog = held.logRatio + half
  const standsOut: StandsOut | null = lowLog > 0 ? 'above' : highLog < 0 ? 'below' : null
  if (standsOut === null) {
    return {
      durationS: held.durationS,
      residual: Math.expm1(held.logRatio),
      low: Math.expm1(lowLog),
      high: Math.expm1(highLog),
      standsOut,
    }
  }
  const sign = standsOut === 'above' ? 1 : -1
  const nearLog = sign * Math.min(Math.abs(lowLog), Math.abs(highLog))
  const estimated = sign * held.sd * conditionalEstimate(Math.abs(held.logRatio) / held.sd, t)
  // A draw just past the cut would state its size at the near end and draw a bar of no width: the stated size is kept at least
  // a quarter of the interval's half-width inside it, so the bar is always there to read.
  const stated =
    sign *
    Math.min(
      Math.abs(held.logRatio),
      Math.max(Math.abs(nearLog) + half * MIN_BAR_HALF_SHARE, Math.abs(estimated)),
    )
  const far = stated + (stated - nearLog)
  return {
    durationS: held.durationS,
    residual: Math.expm1(stated),
    low: Math.expm1(Math.min(nearLog, far)),
    high: Math.expm1(Math.max(nearLog, far)),
    standsOut,
  }
}

/**
 * Which durations of one sport's best curve stand out from the rest of it, from `startS` (5 s unless the
 * sport's curve starts later, as a run's does) to 60 min. Nothing shorter than `startS` is read, named
 * or returned.
 *
 * Each duration is predicted from the others with Morton's three-parameter critical-power model, fitted
 * on log values (see docs/research/duration-profile.md), and its best is compared with that. A duration
 * stands out when the interval round the difference excludes zero. The result is a fact about the
 * curve, not about the athlete's capability: a best is a lower bound, so one far below the rest may be
 * untried.
 */
export function durationProfile(
  curve: readonly ProfilePoint[],
  startS: number = PROFILE_MIN_S,
  activities: number = PROFILE_IN_LINE_MIN_ACTIVITIES,
): DurationProfile {
  const points = curve.filter(inRange(startS)).sort((a, b) => a.durationS - b.durationS)
  const anchored = points.some((point) => point.durationS <= PROFILE_ANCHOR_S)
  const shown = anchored ? points : points.filter((point) => point.durationS >= PROFILE_FLOOR_S)
  const missing = gapsOf(points, shown, startS)
  if (missing.length > 0) return { status: 'missing', missing }
  const held = leaveOneOut(shown, anchored)
  if (held.length < PROFILE_MIN_DURATIONS) return { status: 'unfit' }
  const quantiles = new Map<number, number>()
  const level = levelFor(activities)
  return {
    status: 'ready',
    rows: held.map((one) => rowOf(one, held.length, quantiles, level)),
    anchored,
    startS,
    activities,
  }
}
