import { DAY_MS, HEADLINE_DURATION_S } from '../constants'
import { memoByDigests } from '../digestMemo'
import { requirePositiveFinite } from '../math'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'
import { effortsCount } from './effortTrust'
import type { Masses } from './masses'
import { massesOf } from './masses'
import { orderedFor } from './consumers'
import { ofSport } from './ordered'
import { estimatedStanding, ownRideGate } from './estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from './estimatedRide'
import { trustedPower } from './powerCheck'
import { fitBikeModelOver, pointWkg, runCentralWkg } from './rideCurves'
import { firstStartingAfter } from './startOrder'
import { localAxisMs, localWeeksOn, weekEndFor, weekEndsSpan } from '../calendar'
import { DEFAULT_WINDOW_DAYS, EFFORT_LENGTHS_S, weekEndMs } from './trendPoints'
import { EVERY_EFFORT_KEYED } from './readingRule'
import type { KeyedReadingRule, ReadingRule } from './readingRule'

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
   * The body mass, kg, of the ride that set rideWkg. Present only when the athlete has dated body
   * masses, since otherwise it is the one mass every ride is priced at.
   */
  rideMassKg?: number
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
   * The library's estimated-ride gate (`HeartRateJudgement.rideGate`), so a ride without a power meter counts as
   * it does in the analysis. Built from the digests when absent; null counts every estimated point.
   */
  rideGate?: EstimatedRideGate | null
  /**
   * Which of an activity's efforts may lead a window. Every effort when absent; the bests-over-time dots pass the rule that
   * leaves out an effort heart rate shows was not hard (`dotsRule`), so a week with only easy efforts has no dot.
   */
  rule?: KeyedReadingRule
}

export { weekEndMs }

/** One activity's best effort at the trend duration: its central metabolic W/kg, and its watts. */
interface Best {
  wkg: number
  /** Mechanical watts for a ride; NaN for a run. */
  watts: number
  /** The body mass the activity was priced at, kg. NaN for a run, whose price reads none. */
  massKg: number
}

/** One activity's best effort at or above the trend duration, with its sport and start. */
interface Reading {
  id: string
  startMs: number
  /** The start on the axis the weeks are cut on (calendar.ts); the start itself with local weeks off. */
  weekMs: number
  sport: Sport
  best: Best
}

/**
 * The best effort of one ride at durationS or longer. Like combine's envelope, a shorter
 * duration takes the best of the longer ones, so a 30-minute value above the 20-minute one counts.
 * Null when the ride has no value there. Within one activity the mass is one number, and central
 * W/kg rises with watts, so the best by W/kg is the best by watts.
 */
function bestAtOrAbove(
  digest: ActivityDigest,
  durationS: number,
  masses: Masses,
  bikeModel: BikeModel,
  standing: EstimatedStanding,
  counts: ReadingRule['point'],
): Best | null {
  let best: Best | null = null
  for (const point of digest.curve) {
    if (point.durationS < durationS || !counts(digest, point)) continue
    const priced = pointWkg(point, digest, masses, bikeModel, standing)
    // An unbacked estimate counts at its own duration only: the envelope does not take it to a shorter one.
    if (priced.alone && point.durationS !== durationS) continue
    if (Number.isFinite(priced.wkg) && (best === null || priced.wkg > best.wkg)) {
      best = { wkg: priced.wkg, watts: priced.watts, massKg: masses.bodyKg(digest) }
    }
  }
  return best
}

/** The same for a run, whose pace is priced without mass, a model or a gate; its `massKg` is NaN, as it is not read. */
function bestRunAtOrAbove(
  digest: ActivityDigest,
  durationS: number,
  counts: ReadingRule['point'],
): Best | null {
  let best: Best | null = null
  for (const point of digest.curve) {
    if (point.durationS < durationS || !counts(digest, point)) continue
    const wkg = runCentralWkg(point)
    if (Number.isFinite(wkg) && (best === null || wkg > best.wkg)) {
      best = { wkg, watts: Number.NaN, massKg: Number.NaN }
    }
  }
  return best
}

/** The readings of these digests at durationS, in the order given; a treadmill run's pace is not an effort (see effortsCount). */
function readingsOf(digests: ActivityDigest[], best: (digest: ActivityDigest) => Best | null) {
  const readings: Reading[] = []
  for (const digest of digests) {
    if (!effortsCount(digest)) continue
    const found = best(digest)
    if (found !== null)
      readings.push({
        id: digest.id,
        startMs: digest.startMs,
        weekMs: localAxisMs(digest),
        sport: digest.sport,
        best: found,
      })
  }
  // Digests are in order of start; the week axis moves a start by up to a day either way, so cut weeks need not be.
  if (localWeeksOn()) readings.sort((x, y) => x.weekMs - y.weekMs || (x.id < y.id ? -1 : 1))
  return readings
}

/** The runs' readings at a trend duration: they read nothing but the runs, so a change of body mass takes the ones kept. */
const runReadings = memoByDigests(
  (runs: ActivityDigest[], { durationS, rule }: { durationS: number; rule: KeyedReadingRule }) =>
    readingsOf(runs, (run) => bestRunAtOrAbove(run, durationS, rule.rule.point)),
  (a, b) => a.durationS === b.durationS && a.rule.key === b.rule.key,
  undefined,
  EFFORT_LENGTHS_S.length,
)

/** Two lists of readings, each in order of week-axis start and then id, as one. */
function mergedByStart(a: Reading[], b: Reading[]): Reading[] {
  const merged: Reading[] = []
  let i = 0
  let j = 0
  const before = (x: Reading, y: Reading) =>
    x.weekMs < y.weekMs || (x.weekMs === y.weekMs && x.id < y.id)
  while (i < a.length && j < b.length) merged.push(before(a[i]!, b[j]!) ? a[i++]! : b[j++]!)
  while (i < a.length) merged.push(a[i++]!)
  while (j < b.length) merged.push(b[j++]!)
  return merged
}

/**
 * Weekly rolling best of running and riding metabolic W/kg. Each point covers the trailing
 * windowDays window that ends at the point. Values use the same prior-mean conversion as combine,
 * with the bike model fitted to the same set. Digests of other model revisions are ignored. The
 * caller passes the set the analysis sees, after near-duplicates are hidden. Every week from the
 * first activity (or the period's start) to the last is returned, however long the library: a week costs
 * a binary search and the readings in its window, so a decade is a few hundred points. Each point also
 * names the start of the activity that set each value.
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
  const ordered = orderedFor('trend', digests)
  if (ordered.length === 0) return []

  const masses = massesOf(settings)
  const bikeModel = opts.bikeModel ?? fitBikeModelOver(ordered, masses).model
  const standing = estimatedStanding(
    opts.rideGate === undefined ? ownRideGate(trustedPower(ordered, masses)) : opts.rideGate,
  )
  const rule = opts.rule ?? EVERY_EFFORT_KEYED
  const readings = mergedByStart(
    runReadings(ofSport(ordered, 'run'), { durationS, rule }),
    readingsOf(ofSport(ordered, 'ride'), (ride) =>
      bestAtOrAbove(ride, durationS, masses, bikeModel, standing, rule.rule.point),
    ),
  )

  // The weeks run from the week of the first activity (or of the period's first window) to the last's. In local
  // weeks the first by start is not always in the first week, so the span is read from the weeks themselves.
  const span = weekEndsSpan(ordered)!
  const firstEnd =
    opts.fromMs === undefined
      ? span.first
      : Math.max(span.first, weekEndFor({ startMs: opts.fromMs + windowMs }))
  const points: TrendPoint[] = []
  for (let endMs = firstEnd; endMs <= span.last; endMs += WEEK_MS) {
    const windowStart = endMs - windowMs
    const top: Record<Sport, Reading | null> = { run: null, ride: null }
    const count: Record<Sport, number> = { run: 0, ride: 0 }
    // The readings are in order of week-axis start, so a week's are found, not filtered out of every reading.
    // A reading is in the window exactly when its week end (weekEndFor) is after the window's and not after
    // the point's: window edges are week ends, so the week axis and the week end agree on membership.
    const at = (reading: Reading) => reading.weekMs
    const end = firstStartingAfter(readings, endMs, at)
    for (let r = firstStartingAfter(readings, windowStart, at); r < end; r++) {
      const reading = readings[r]!
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
      ...(masses.dated && ride ? { rideMassKg: ride.best.massKg } : {}),
    })
  }
  return points
}
