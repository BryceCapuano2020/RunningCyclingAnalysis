import { DURATIONS_S, ESTIMATED_RIDE_MIN_SHARE } from '../constants'
import { fitLine, lowForPowerSetAside } from '../hr'
import type { Level, Line } from '../hr'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'
import { effortsCount } from './effortTrust'

/**
 * A ride priced by a bike model has no meter behind it, and a window picked for its terms can be
 * overstated: a fast flat stretch or a descent in a group is mostly aero term and a draft. The athlete's
 * heart rate says what the effort cost. A ride point without a power meter counts toward bests, curves,
 * thresholds, records and the trend only if its window's mean heart rate is at least minShare of the heart
 * rate the athlete's measured rides show at that power and that duration. Heart rate lags in a short window,
 * but it lags the same in a measured window of the same duration, which is why each duration has its own line.
 *
 * minShare is 0.9. In the synthetic sweep of the test (6 bpm of day-to-day spread in heart rate, a 12% error in the
 * estimated watts) it keeps 95% of honest estimated windows and 98% of exact ones, drops 58% of windows priced 30% over
 * their watts and all of those ridden at 70% of the line. 0.85 would keep 99% of honest windows but also 90% of the
 * overstated ones; a line is a loose guide to a short window, where heart rate hardly rises with watts, and the cost of
 * a dropped honest window is only that the next one counts, where an inflated best misleads.
 * minActivities is 6 measured rides with heart rate for a line (and for the gate at all): a screen with this much room
 * needs fewer than the 12 that judging a whole activity does, and a line over 6 rides keeps 94% of honest windows against 95% over 12 or more.
 */
export const ESTIMATED_RIDE = {
  minActivities: 6,
  minShare: ESTIMATED_RIDE_MIN_SHARE,
} as const

/** A line of heart rate on measured watts, and the watts it was fitted over: it is never read beyond them. */
interface DurationLine extends Line {
  from: number
  to: number
}

/**
 * What a library's measured rides say about heart rate against watts, one line per curve duration, and whose
 * heart rate is not to be trusted. A duration with too few measured windows, or whose heart rate does not
 * rise with watts, has no line. Judged over a whole library (`HeartRateJudgement.rideGate`), so every page
 * reads an estimated ride the same way.
 */
export interface EstimatedRideGate {
  lines: ReadonlyMap<number, DurationLine>
  /** Ids of the activities whose heart rate is set aside: an estimated window of theirs has no heart rate. */
  untrusted: ReadonlySet<string>
}

/** A digest's curve point at a duration; a digest holds one per DURATIONS_S entry in order, so it is at the index. */
export function pointAt(digest: ActivityDigest, index: number): DigestCurvePoint | undefined {
  const durationS = DURATIONS_S[index]
  const aligned = digest.curve[index]
  return aligned?.durationS === durationS
    ? aligned
    : digest.curve.find((p) => p.durationS === durationS)
}

/** Whether a sport's estimated watts are gated: a run's pace is not an estimate of power. */
const GATED: Record<Sport, boolean> = { run: false, ride: true }

const isMeasuredRide = (digest: ActivityDigest): boolean =>
  GATED[digest.sport] && digest.powerSource === 'measured' && effortsCount(digest)

function measuredWatts(point: DigestCurvePoint | undefined): number {
  return point !== undefined && point.terms === null && point.value > 0 ? point.value : Number.NaN
}

/** The line through one duration's measured windows, refitted without those already under minShare of the first. */
function lineOver(levels: Level[]): DurationLine | null {
  const first = fitLine(levels)
  if (first === null) return null
  const share = (level: Level, line: Line) =>
    level.heartRate >= ESTIMATED_RIDE.minShare * (line.intercept + line.slope * level.output)
  const kept = levels.filter((level) => share(level, first))
  const line = kept.length >= ESTIMATED_RIDE.minActivities ? fitLine(kept) : first
  if (line === null) return null
  const used = kept.length >= ESTIMATED_RIDE.minActivities ? kept : levels
  const outputs = used.map((level) => level.output)
  return { ...line, from: Math.min(...outputs), to: Math.max(...outputs) }
}

/**
 * The gate of a set of digests, taking heart rate only from the activities not in setAside. Null when
 * fewer than minActivities measured rides have heart rate to fit: then nothing about an estimated ride changes.
 */
export function rideGateOf(
  ordered: ActivityDigest[],
  setAside: ReadonlySet<string>,
): EstimatedRideGate | null {
  const fitted = ordered.filter(
    (digest) => isMeasuredRide(digest) && digest.hasHeartRate && !setAside.has(digest.id),
  )
  if (fitted.length < ESTIMATED_RIDE.minActivities) return null
  const lines = new Map<number, DurationLine>()
  for (const [index, durationS] of DURATIONS_S.entries()) {
    const levels: Level[] = []
    for (const digest of fitted) {
      const point = pointAt(digest, index)
      const output = measuredWatts(point)
      const heartRate = point?.heartRate ?? Number.NaN
      if (output > 0 && heartRate > 0) levels.push({ id: digest.id, output, heartRate })
    }
    if (levels.length < ESTIMATED_RIDE.minActivities) continue
    const line = lineOver(levels)
    if (line !== null) lines.set(durationS, line)
  }
  return { lines, untrusted: setAside }
}

/**
 * The gate of digests judged among themselves, for a reader given none from the library: heart rate that reads
 * low for the power across a whole activity is left out of the fit and trusted in no estimated window.
 */
export function ownRideGate(ordered: ActivityDigest[]): EstimatedRideGate | null {
  return rideGateOf(ordered, lowForPowerSetAside(ordered))
}

/** The heart rate the athlete's measured rides show at these watts, held at the ends of the fitted range. */
function expectedHeartRate(line: DurationLine, watts: number): number {
  return line.intercept + line.slope * Math.min(line.to, Math.max(line.from, watts))
}

/** Whether a ride point priced at `watts` may be counted: see ESTIMATED_RIDE. */
export type EstimatedHolds = (
  digest: ActivityDigest,
  point: DigestCurvePoint,
  watts: number,
) => boolean

/**
 * The test of ride points among `ordered`. A point with a power meter always holds. An estimated point
 * (it has terms) holds if its window's heart rate, when trusted, is at least minShare of the expected at
 * its watts; a window with no trusted heart rate, or no line to judge it by, holds only where `ordered`
 * has no measured point at that duration, so it never outranks a measurement. Without a gate every point holds.
 */
export function estimatedHolds(
  gate: EstimatedRideGate | null,
  ordered: ActivityDigest[],
): EstimatedHolds {
  if (gate === null) return () => true
  const measured = new Set<number>()
  for (const digest of ordered.filter(isMeasuredRide)) {
    for (const [index, durationS] of DURATIONS_S.entries()) {
      if (measuredWatts(pointAt(digest, index)) > 0) measured.add(durationS)
    }
  }
  return (digest, point, watts) => {
    if (point.terms === null || !(watts > 0)) return true
    const heartRate = gate.untrusted.has(digest.id) ? null : point.heartRate
    const line = gate.lines.get(point.durationS)
    // With no heart rate, or no line at this duration to judge it by, the window is unbacked.
    if (heartRate === null || !(heartRate > 0) || line === undefined) {
      return !measured.has(point.durationS)
    }
    return heartRate >= ESTIMATED_RIDE.minShare * expectedHeartRate(line, watts)
  }
}
