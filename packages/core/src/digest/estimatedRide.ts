import { DURATIONS_S, ESTIMATED_RIDE_MIN_RIDES, ESTIMATED_RIDE_MIN_SHARE } from '../constants'
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
 * estimated watts) it keeps about 95% of honest estimated windows and 98% of exact ones, and drops more than half of the
 * windows priced 30% over their watts and all of those ridden at 70% of the line. A scratch sweep with 0.85 kept 99% of
 * honest windows but 90% of the overstated ones. A line is a loose guide to a short window, where heart rate hardly rises
 * with watts, and the cost of a dropped honest window is only that the next one counts, where an inflated best misleads.
 * minRides is the measured rides with heart rate a line (and the gate at all) needs: a screen with this much room needs
 * fewer than the 12 that judging a whole activity does. A scratch sweep gave a line over 6 rides 94% of honest windows
 * against 95% over 12 or more.
 *
 * A virtual ride's heart rate is taken as recorded. Neither set-aside path judges a ride without a power meter, since
 * its watts are the estimate in doubt; only the measured rides' heart rate is left out of the line when it is set aside.
 */
export const ESTIMATED_RIDE = {
  minRides: ESTIMATED_RIDE_MIN_RIDES,
  minShare: ESTIMATED_RIDE_MIN_SHARE,
} as const

/** A line of heart rate on measured watts, and the watts it was fitted over: it is never read beyond them. */
interface DurationLine extends Line {
  from: number
  to: number
}

/**
 * What a library's measured rides say about heart rate against watts: one line per curve duration, and the durations
 * at which the library holds a measured point. A duration with too few measured windows with heart rate, or whose
 * heart rate does not rise with watts, has no line. Judged over a whole library (`HeartRateJudgement.rideGate`), so
 * every period, trend and record reads an estimated ride the same way. The line is in absolute watts, so a change in
 * mass moves a virtual ride's watts against it slightly.
 */
export interface EstimatedRideGate {
  lines: ReadonlyMap<number, DurationLine>
  /**
   * The durations at which the library has a measured point, or at a longer one: the monotone envelope copies a
   * longer effort's watts down to every shorter duration, so a measured point at 3 h makes every duration measured.
   */
  measuredDurations: ReadonlySet<number>
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
  const share = (level: Level) =>
    level.heartRate >= ESTIMATED_RIDE.minShare * (first.intercept + first.slope * level.output)
  const kept = levels.filter(share)
  // Nothing under the tolerance, or too few left to refit over: the first line stands.
  const refit = kept.length < levels.length && kept.length >= ESTIMATED_RIDE.minRides
  const used = refit ? kept : levels
  const line = refit ? fitLine(kept) : first
  if (line === null) return null
  let from = Infinity
  let to = -Infinity
  for (const level of used) {
    from = Math.min(from, level.output)
    to = Math.max(to, level.output)
  }
  return { ...line, from, to }
}

/** The durations at which a measured ride has a point, or at a longer one. */
function measuredDurationsOf(measured: ActivityDigest[]): Set<number> {
  let longest = 0
  for (const digest of measured) {
    for (const [index, durationS] of DURATIONS_S.entries()) {
      if (durationS > longest && measuredWatts(pointAt(digest, index)) > 0) longest = durationS
    }
  }
  return new Set(DURATIONS_S.filter((durationS) => durationS <= longest))
}

/**
 * The gate of a set of digests, taking heart rate only from the measured rides not in setAside. Null when
 * fewer than minRides measured rides have heart rate to fit: then nothing about an estimated ride changes.
 */
export function rideGateOf(
  ordered: ActivityDigest[],
  setAside: ReadonlySet<string>,
): EstimatedRideGate | null {
  const measured = ordered.filter(isMeasuredRide)
  const fitted = measured.filter((digest) => digest.hasHeartRate && !setAside.has(digest.id))
  if (fitted.length < ESTIMATED_RIDE.minRides) return null
  const lines = new Map<number, DurationLine>()
  for (const [index, durationS] of DURATIONS_S.entries()) {
    const levels: Level[] = []
    for (const digest of fitted) {
      const point = pointAt(digest, index)
      const output = measuredWatts(point)
      const heartRate = point?.heartRate ?? Number.NaN
      if (output > 0 && heartRate > 0) levels.push({ id: digest.id, output, heartRate })
    }
    if (levels.length < ESTIMATED_RIDE.minRides) continue
    const line = lineOver(levels)
    if (line !== null) lines.set(durationS, line)
  }
  return { lines, measuredDurations: measuredDurationsOf(measured) }
}

/**
 * The gate of digests judged among themselves, for a reader given none from the library: heart rate that reads
 * low for the power across a whole activity is left out of the fit.
 */
export function ownRideGate(ordered: ActivityDigest[]): EstimatedRideGate | null {
  return rideGateOf(ordered, lowForPowerSetAside(ordered))
}

/** The heart rate the athlete's measured rides show at these watts, held at the ends of the fitted range. */
function expectedHeartRate(line: DurationLine, watts: number): number {
  return line.intercept + line.slope * Math.min(line.to, Math.max(line.from, watts))
}

/**
 * How a ride point priced at `watts` stands: it holds (counts everywhere, through the monotone envelope too), stands
 * (counts at its own duration only), or drops (does not count). See ESTIMATED_RIDE.
 */
export type Standing = 'holds' | 'stands' | 'drops'

export type EstimatedStanding = (point: DigestCurvePoint, watts: number) => Standing

/**
 * The standing of ride points. A point with a power meter always holds. An estimated point (it has terms) is backed
 * if its window's mean heart rate is at least minShare of the expected at its watts, and holds; below that it drops.
 * A window with no heart rate, or no line to judge it by, is unbacked: it drops at a duration the library has
 * measured, and elsewhere stands at its own duration only. It is never copied to a shorter duration, so it cannot
 * outrank a measurement, in any unit and in any period. Without a gate every point holds.
 */
export function estimatedStanding(gate: EstimatedRideGate | null): EstimatedStanding {
  if (gate === null) return () => 'holds'
  return (point, watts) => {
    if (point.terms === null || !(watts > 0)) return 'holds'
    const heartRate = point.heartRate
    const line = gate.lines.get(point.durationS)
    if (heartRate === null || !(heartRate > 0) || line === undefined) {
      return gate.measuredDurations.has(point.durationS) ? 'drops' : 'stands'
    }
    return heartRate >= ESTIMATED_RIDE.minShare * expectedHeartRate(line, watts) ? 'holds' : 'drops'
  }
}

/**
 * A gate as a key: gates with the same lines and measured durations are the same key, so an activity that leaves
 * them as they are does not redo a period; none, and the reader's own, are each their own.
 */
export function rideGateKey(gate: EstimatedRideGate | null | undefined): string {
  if (gate === undefined) return 'own'
  if (gate === null) return 'none'
  return JSON.stringify([[...gate.lines], [...gate.measuredDurations]])
}
