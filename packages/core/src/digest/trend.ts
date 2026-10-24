import { DAY_MS, HEADLINE_DURATION_S } from '../constants'
import { requirePositiveFinite } from '../math'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint, Sport } from '../types'
import {
  centralWkgFromWatts,
  fitBikeModelFor,
  orderedCurrent,
  rideWattsAt,
  runCentralWkg,
  totalCalibration,
} from './combine'
import { DEFAULT_WINDOW_DAYS } from './trendPoints'

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
}

/** The Sunday 23:59:59.999 UTC that ends the calendar week (Monday to Sunday, UTC) of ms. */
export function weekEndMs(ms: number): number {
  const date = new Date(ms)
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const daysToSunday = (7 - date.getUTCDay()) % 7
  return dayStart + (daysToSunday + 1) * DAY_MS - 1
}

/** One activity's central metabolic W/kg at the trend duration, with its sport and start. */
interface Reading {
  startMs: number
  sport: Sport
  wkg: number
}

/**
 * The best central metabolic W/kg of one activity at durationS or longer. Like combine's envelope,
 * a shorter duration takes the best of the longer ones, so a 30-minute value above the 20-minute
 * one counts. NaN when the activity has no value there.
 */
function bestAtOrAbove(
  digest: ActivityDigest,
  durationS: number,
  massKg: number,
  totalMassKg: number,
  bikeModel: BikeModel,
): number {
  let best = Number.NaN
  for (const point of digest.curve) {
    if (point.durationS < durationS) continue
    const wkg = centralWkg(digest.sport, point, massKg, totalMassKg, bikeModel)
    if (Number.isFinite(wkg) && (Number.isNaN(best) || wkg > best)) best = wkg
  }
  return best
}

function centralWkg(
  sport: Sport,
  point: DigestCurvePoint,
  massKg: number,
  totalMassKg: number,
  bikeModel: BikeModel,
): number {
  return sport === 'run'
    ? runCentralWkg(point)
    : centralWkgFromWatts(rideWattsAt(point, totalMassKg, bikeModel), massKg)
}

/**
 * Weekly rolling best of running and riding metabolic W/kg. Each point covers the trailing
 * windowDays window that ends at the point. Values use the same prior-mean conversion as combine,
 * with the bike model fitted to the same set. Digests of other model revisions are ignored. The
 * caller passes the set the analysis sees, after near-duplicates are hidden. Only the most recent
 * 260 weeks are returned.
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
    const wkg = bestAtOrAbove(digest, durationS, massKg, totalMassKg, bikeModel)
    if (Number.isFinite(wkg)) readings.push({ startMs: digest.startMs, sport: digest.sport, wkg })
  }

  const lastEnd = weekEndMs(last.startMs)
  const earliest =
    opts.fromMs === undefined ? first.startMs : Math.max(first.startMs, opts.fromMs + windowMs)
  const firstEnd = Math.max(weekEndMs(earliest), lastEnd - (MAX_POINTS - 1) * WEEK_MS)
  const points: TrendPoint[] = []
  for (let endMs = firstEnd; endMs <= lastEnd; endMs += WEEK_MS) {
    const windowStart = endMs - windowMs
    const best: Record<Sport, number | null> = { run: null, ride: null }
    const count: Record<Sport, number> = { run: 0, ride: 0 }
    for (const reading of readings) {
      if (reading.startMs <= windowStart || reading.startMs > endMs) continue
      count[reading.sport]++
      const current = best[reading.sport]
      if (current === null || reading.wkg > current) best[reading.sport] = reading.wkg
    }
    points.push({
      endMs,
      runWkg: best.run,
      rideWkg: best.ride,
      runCount: count.run,
      rideCount: count.ride,
    })
  }
  return points
}
