import { DAY_MS, HEADLINE_DURATION_S } from '../constants'
import { requirePositiveFinite } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  DigestCurvePoint,
  HrCrossCheck,
  Interval,
  Sport,
} from '../types'
import {
  centralWkgFromWatts,
  equivalenceFor,
  fitBikeModelFor,
  orderedCurrent,
  rideWattsAt,
  runCentralWkg,
  totalCalibration,
} from './combine'
import { DEFAULT_WINDOW_DAYS, weekEndMs } from './trendPoints'

const MAX_POINTS = 260
const WEEK_MS = 7 * DAY_MS

export interface TrendPoint {
  /** End of the week this point describes: Sunday 23:59:59.999 UTC. */
  endMs: number
  /** Best gross metabolic W/kg for running in the trailing window; null without a run. */
  runWkg: number | null
  /** Best gross metabolic W/kg for riding in the trailing window; null without a ride. */
  rideWkg: number | null
  /** Runs in the window that have a value at the trend duration. */
  runCount: number
  /** Rides in the window that have a value at the trend duration. */
  rideCount: number
  /** Start of the run that set runWkg; null without a run. */
  runAtMs: number | null
  /** Start of the ride that set rideWkg; null without a ride. */
  rideAtMs: number | null
  /**
   * The running equivalent of the best ride in the window: the flat running speed, in m/s, that
   * costs the same metabolic power, with the range of the heart-rate model. At the headline duration
   * it is the speed combine gives the same ride. Null without a ride, or unless the trend was asked
   * for it through `equivalence`.
   */
  rideRunSpeed: Interval | null
}

export interface TrendOptions {
  durationS?: number
  windowDays?: number
  /**
   * The earliest instant a trailing window may start at. A point whose window would reach before it
   * is left out, so a period's trend never counts activity from before the period.
   */
  fromMs?: number
  /** The bike model to price rides with. Fitted to the digests when not given. */
  bikeModel?: BikeModel
  /**
   * When given, each point's best ride is also converted to its running equivalent, with the
   * heart-rate model of the analysis of the same digests, as the cards convert it.
   */
  equivalence?: { hr: HrCrossCheck | null }
}

export { weekEndMs }

/** One activity's best effort at the trend duration: its central metabolic W/kg, and its watts. */
interface Best {
  wkg: number
  /** Mechanical watts for a ride; NaN for a run. */
  watts: number
}

/** One activity's best effort at or above the trend duration, with its sport and start. */
interface Reading {
  startMs: number
  sport: Sport
  best: Best
}

function measureOf(
  sport: Sport,
  point: DigestCurvePoint,
  massKg: number,
  totalMassKg: number,
  bikeModel: BikeModel,
): Best {
  if (sport === 'run') return { wkg: runCentralWkg(point), watts: Number.NaN }
  const watts = rideWattsAt(point, totalMassKg, bikeModel)
  return { wkg: centralWkgFromWatts(watts, massKg), watts }
}

/**
 * The best effort of one activity at durationS or longer. Like combine's envelope, a shorter
 * duration takes the best of the longer ones, so a 30-minute value above the 20-minute one counts.
 * Null when the activity has no value there. Central W/kg rises with watts, so the best by W/kg
 * is the best by watts.
 */
function bestAtOrAbove(
  digest: ActivityDigest,
  durationS: number,
  massKg: number,
  totalMassKg: number,
  bikeModel: BikeModel,
): Best | null {
  let best: Best | null = null
  for (const point of digest.curve) {
    if (point.durationS < durationS) continue
    const candidate = measureOf(digest.sport, point, massKg, totalMassKg, bikeModel)
    if (Number.isFinite(candidate.wkg) && (best === null || candidate.wkg > best.wkg)) {
      best = candidate
    }
  }
  return best
}

/**
 * Weekly rolling best of running and riding metabolic W/kg. Each point covers the trailing
 * windowDays window that ends at the point. Values use the same prior-mean conversion as combine,
 * with the bike model fitted to the same set. Digests of other model revisions are ignored. The
 * caller passes the set the analysis sees, after near-duplicates are hidden. Only the most recent
 * 260 weeks are returned. Each point also names the start of the activity that set each value,
 * and, when asked, converts the best ride to its running equivalent once per distinct power.
 */
export function fitnessTrend(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  opts: TrendOptions = {},
): TrendPoint[] {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const durationS = opts.durationS ?? HEADLINE_DURATION_S
  const windowMs = (opts.windowDays ?? DEFAULT_WINDOW_DAYS) * DAY_MS
  const ordered = orderedCurrent(digests)
  const first = ordered[0]
  const last = ordered.at(-1)
  if (first === undefined || last === undefined) return []

  const massKg = settings.massKg
  const totalMassKg = settings.massKg + settings.bikeMassKg
  const bikeModel = opts.bikeModel ?? fitBikeModelFor(totalCalibration(ordered), totalMassKg).model
  const readings: Reading[] = []
  for (const digest of ordered) {
    const best = bestAtOrAbove(digest, durationS, massKg, totalMassKg, bikeModel)
    if (best !== null) readings.push({ startMs: digest.startMs, sport: digest.sport, best })
  }

  const equivalenceAt = opts.equivalence ? equivalenceFor(opts.equivalence.hr) : null
  const speedByWatts = new Map<number, Interval>()
  const speedOf = (watts: number): Interval | null => {
    if (equivalenceAt === null) return null
    let speed = speedByWatts.get(watts)
    if (speed === undefined) {
      speed = equivalenceAt(watts, massKg)
      speedByWatts.set(watts, speed)
    }
    return speed
  }

  const lastEnd = weekEndMs(last.startMs)
  const earliest =
    opts.fromMs === undefined ? first.startMs : Math.max(first.startMs, opts.fromMs + windowMs)
  const firstEnd = Math.max(weekEndMs(earliest), lastEnd - (MAX_POINTS - 1) * WEEK_MS)
  const points: TrendPoint[] = []
  for (let endMs = firstEnd; endMs <= lastEnd; endMs += WEEK_MS) {
    const windowStart = endMs - windowMs
    const top: Record<Sport, Reading | null> = { run: null, ride: null }
    const count: Record<Sport, number> = { run: 0, ride: 0 }
    for (const reading of readings) {
      if (reading.startMs <= windowStart || reading.startMs > endMs) continue
      count[reading.sport]++
      const current = top[reading.sport]
      if (current === null || reading.best.wkg > current.best.wkg) top[reading.sport] = reading
    }
    const ride = top.ride
    points.push({
      endMs,
      runWkg: top.run?.best.wkg ?? null,
      rideWkg: ride?.best.wkg ?? null,
      runCount: count.run,
      rideCount: count.ride,
      runAtMs: top.run?.startMs ?? null,
      rideAtMs: ride?.startMs ?? null,
      rideRunSpeed: ride ? speedOf(ride.best.watts) : null,
    })
  }
  return points
}
