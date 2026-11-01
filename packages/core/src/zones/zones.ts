import type { Dated } from '../calendar'
import { massAtFor } from '../athlete/mass'
import { entryAt } from '../athlete/measurements'
import type { AthleteSettings } from '../athlete/settings'
import { DISTRIBUTION_BINS, PRIORS } from '../constants'
import { EDGE_EPSILON } from '../math'
import type { ReferenceMax } from '../digest/referenceMax'
import type { HeartRateJudgement } from '../digest/setAsideTypes'
import { floorAt } from '../digest/thresholdFloor'
import { thresholdAt } from '../digest/thresholdTimelineTypes'
import type { ThresholdFloors, ThresholdTimeline } from '../digest/thresholdTimelineTypes'
import { weekEndFor } from '../calendar'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import { SPORTS } from '../types'
import type { Sport } from '../types'
import {
  EDGE_ROUNDING,
  WHOLE_NUMBER_MEASURES,
  ZONE_MEASURES,
  ZONE_OVERRIDE,
  ZONE_SCHEMES,
} from './schemes'
import { settledThresholds } from './settleThresholds'
import { DISTRIBUTION_OF } from './timeInZones'
import type { ZoneMeasure } from './schemes'

/**
 * One zone, in the measure's unit: watts, bpm, or running speed in m/s. It holds the values from
 * `low` up to, not including, `high`. The lowest zone starts at 0, and the highest has no upper
 * limit (`high` is null), so every reading falls in exactly one zone.
 */
export interface Zone {
  /** 1 for the lowest effort. */
  level: number
  name: string
  low: number
  high: number | null
}

/**
 * Where a zone set's reference came from: `entered` is a dated setting the athlete typed, and
 * `estimated` is the app's own figure from the activities (critical power, or the reference heart rate).
 */
export type ZoneSource = 'entered' | 'estimated'

export interface ZoneSet {
  sport: Sport
  measure: ZoneMeasure
  source: ZoneSource
  /** Threshold power W, maximum heart rate bpm, or threshold speed m/s that the zones are cut from. */
  reference: number
  /**
   * The sports whose activities an estimated reference rests on, empty when it was entered. A heart-rate
   * reference is the higher of the sport's own maximum and one worked out from the other sport's, so it
   * can rest on both.
   */
  estimatedFrom: Sport[]
  /**
   * For an estimated heart-rate reference that is a sport's own maximum, what it rests on: the days that reached it
   * and the date it counts from. Null for an entered reference, a pace or power, and a reference worked out from the other sport.
   */
  maxHeartRateFrom: ReferenceMax | null
  /**
   * For an estimated pace or power reference that is not from the half year ending at the date, because that
   * window could not support one: the start of the newest activity of the older fit it comes from, ms. Null otherwise.
   */
  asOfMs: number | null
  /**
   * For an estimated pace or power reference that no fit stands for (none in the half year before the date, and none
   * within a year), the length, s, of the best it is a floor from: the best 30 minutes in the 12 months up to the date's
   * week, else the best 20 (`floorAt`). `asOfMs` is then the day that best was set. Null otherwise.
   */
  floorS: number | null
  /**
   * For an estimated heart-rate reference cut from the highest heart rate on file because no effort reached near a
   * maximum (`UntrustedMax` `low` or `habitual`). Zones follow the highest value there is. False otherwise.
   */
  fromHighest: boolean
  /** The published scheme, for the line under the table. */
  citation: string
  zones: Zone[]
}

/**
 * The zones of a measure for a reference value, by the published scheme. A heart rate is a whole number, so
 * its edges are the first whole number at or above the cut (0.7 of 190 bpm is 133; 0.6 of 219 is 131.4, so
 * 132): a reading of 131 bpm is below 131.4 and in the zone below, and 132 is the first in the zone above.
 * Power and pace are moved to the nearest step of the digest's bins: power to 5 W, at most 2.5 W from the cut,
 * and pace to 0.05 m/s, at most 0.025 m/s from the cut, which is about 3 s/km at a 5:00 /km threshold and up to
 * about 10 s/km at 9:00 /km. The top pace edge, a hair above the threshold speed itself, moves up instead,
 * by less than 0.05 m/s (up to about 15 s/km at slow thresholds), so it stays above the threshold. No bin
 * of a digest then straddles an edge, so the seconds the period view places in a zone are the seconds the
 * activity page does, and the ranges Profile writes are the zones a recorded second is placed in. An entered
 * threshold is cut the same way.
 */
export function zonesFor(measure: ZoneMeasure, reference: number): Zone[] {
  const { names, cuts } = ZONE_SCHEMES[measure]
  const step = DISTRIBUTION_BINS[DISTRIBUTION_OF[measure]].width
  const rounding = EDGE_ROUNDING[measure]
  const edge = (index: number): number => {
    const steps = (reference * cuts[index]!) / step
    const how = index === cuts.length - 1 ? rounding.top : rounding.edges
    return (how === 'up' ? Math.ceil(steps - EDGE_EPSILON) : Math.round(steps)) * step
  }
  return names.map((name, i) => ({
    level: i + 1,
    name,
    low: i === 0 ? 0 : edge(i - 1),
    high: i === cuts.length ? null : edge(i),
  }))
}

/**
 * What the zones take as references: each sport's maximum heart rate (the highest value reached on several separate
 * days, and the reference made of the two), and each sport's threshold over time. Plain data, so the session can post it.
 */
export interface ZoneEstimates {
  runMaxHeartRate: number | null
  rideMaxHeartRate: number | null
  runObservedMaxHeartRate: number | null
  rideObservedMaxHeartRate: number | null
  /** What each sport's own maximum rests on. */
  observedMaxSource: Record<Sport, ReferenceMax | null>
  /** The thresholds the pace and power zones are cut from, by week: see `ThresholdTimeline`. */
  thresholds: ThresholdTimeline
  /**
   * Each sport's efforts a floor on its threshold is taken from, which the pace and power zones are cut from on a date no
   * fit stands for (`floorAt`). Absent: none, and those dates have no zones.
   */
  floor?: ThresholdFloors
  /** The day the estimates are as of, ms. Zones for this week or later are current: they may stand on a floor older than a year. */
  nowMs?: number
  /**
   * The sports whose estimated maximum heart rate is not one a maximum can be: `low` (under what a maximum is at the
   * athlete's age) and `habitual` (the typical day already sits at it) mean no effort reached near the athlete's
   * maximum, so the zones are cut from the highest heart rate on file and say so; `high` (far over what a maximum is at
   * their age) keeps its zones and is asked about. Absent when every sport's maximum can be trusted or was entered.
   */
  untrustedMax?: Partial<Record<Sport, UntrustedMax>>
}

/** Why a sport's estimated maximum heart rate is not trusted: see `ZoneEstimates.untrustedMax`. */
export type UntrustedMax = 'low' | 'habitual' | 'high'

/** The maxima that are not trusted as the judgement read them, or nothing when all can be. */
function untrustedMaxOf(judgement: HeartRateJudgement): Pick<ZoneEstimates, 'untrustedMax'> {
  const found: Partial<Record<Sport, UntrustedMax>> = {}
  for (const sport of Object.keys(ZONE_MEASURES) as Sport[]) {
    const reading = judgement.effortReference.reading[sport]
    if (reading === 'low' || reading === 'habitual' || reading === 'high') found[sport] = reading
  }
  return Object.keys(found).length === 0 ? {} : { untrustedMax: found }
}

/** Whether a sport's maximum is only the highest heart rate on file: no effort reached near a maximum. */
function noNearMaximalEffort(estimates: ZoneEstimates, sport: Sport): boolean {
  const reading = estimates.untrustedMax?.[sport]
  return reading === 'low' || reading === 'habitual'
}

const estimatesOfJudgement = new WeakMap<
  HeartRateJudgement,
  { nowMs: number; found: ZoneEstimates }
>()

/**
 * The references of a whole library's judgement as zone estimates: its maxima, as an analysis of it reports
 * them, and its thresholds over time, settled so a hard effort passing through a window does not move the zones, and
 * off in a sport whose whole-library threshold is refused (`settledThresholds`), as of `nowMs`: a threshold that began
 * to hold this week is not yet followed. The same judgement on the same `nowMs` gives the same object, so what is cached
 * by the estimates is found again.
 */
export function zoneEstimatesOf(judgement: HeartRateJudgement, nowMs: number): ZoneEstimates {
  const kept = estimatesOfJudgement.get(judgement)
  if (kept !== undefined && kept.nowMs === nowMs) return kept.found
  const found: ZoneEstimates = {
    runMaxHeartRate: judgement.referenceHr.run,
    rideMaxHeartRate: judgement.referenceHr.ride,
    runObservedMaxHeartRate: judgement.observedMaxHr.run,
    rideObservedMaxHeartRate: judgement.observedMaxHr.ride,
    observedMaxSource: judgement.observedMaxSource,
    thresholds: settledThresholds(judgement.thresholdTimeline, judgement.fit, nowMs),
    floor: judgement.floor,
    nowMs,
    ...untrustedMaxOf(judgement),
  }
  estimatesOfJudgement.set(judgement, { nowMs, found })
  return found
}

interface Estimated {
  reference: number
  from: Sport[]
  maxHeartRateFrom?: ReferenceMax
  asOfMs?: number
  floorS?: number
  fromHighest?: true
}

type Estimate = (estimates: ZoneEstimates, massKg: number, when: Dated) => Estimated | null

const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

/**
 * A heart-rate reference. It is the sport's own maximum when that is the higher figure, and otherwise it is
 * worked out from the other sport's. With none of its own it rests on the other sport alone, and with both it
 * rests on both.
 */
function heartRate(
  sport: Sport,
  reference: number | null,
  observed: number | null,
  source: ReferenceMax | null,
): Estimated | null {
  if (reference === null) return null
  if (reference === observed) {
    return { reference, from: [sport], ...(source === null ? {} : { maxHeartRateFrom: source }) }
  }
  if (observed === null) return { reference, from: [OTHER_SPORT[sport]] }
  return { reference, from: [...SPORTS] }
}

/**
 * A threshold reference from the sport's fit over the half year that ends with the date, or, when that window
 * holds no fit, the newest earlier one within a year (marked with when its efforts end). Where no fit stands, and also where
 * the window's efforts have outgrown the older one, the sport's floor stands in: its best 30 minutes in the 12 months up to
 * the end of the date's week, else its best 20 (marked with the length and the day it was set). With none in those months,
 * only zones for this week or later take the newest effort before them, as `floorAt` has it. `convert` takes the fit's gross
 * metabolic W/kg to the measure's unit.
 */
function threshold(
  sport: Sport,
  estimates: ZoneEstimates,
  when: Dated,
  convert: (cp: number) => number,
): Estimated | null {
  const found = thresholdAt(estimates.thresholds[sport], when)
  if (found === null) {
    const weekEnd = weekEndFor(when)
    const floor = floorAt(
      estimates.floor?.[sport] ?? [],
      weekEnd,
      estimates.nowMs !== undefined && weekEnd >= estimates.nowMs,
    )
    return floor === null
      ? null
      : {
          reference: convert(floor.value),
          from: [sport],
          asOfMs: floor.asOfMs,
          floorS: floor.durationS,
        }
  }
  return {
    reference: convert(found.fit.cp),
    from: [sport],
    ...(found.asOfMs === null ? {} : { asOfMs: found.asOfMs }),
  }
}

/** A heart-rate reference marked when no effort reached near a maximum: the zones are cut from the highest there is. */
function highestOnly(
  estimates: ZoneEstimates,
  sport: Sport,
  found: Estimated | null,
): Estimated | null {
  return found !== null && noNearMaximalEffort(estimates, sport)
    ? { ...found, fromHighest: true }
    : found
}

/**
 * The app's own reference for each sport and measure, null without one. A ride's threshold is a
 * metabolic W/kg fit, so it becomes watts at the athlete's mass on the date asked for.
 */
const ESTIMATE: Record<Sport, Partial<Record<ZoneMeasure, Estimate>>> = {
  run: {
    heartRate: (e) =>
      highestOnly(
        e,
        'run',
        heartRate('run', e.runMaxHeartRate, e.runObservedMaxHeartRate, e.observedMaxSource.run),
      ),
    pace: (e, _massKg, when) => threshold('run', e, when, metabolicToFlatSpeed),
  },
  ride: {
    heartRate: (e) =>
      highestOnly(
        e,
        'ride',
        heartRate('ride', e.rideMaxHeartRate, e.rideObservedMaxHeartRate, e.observedMaxSource.ride),
      ),
    power: (e, massKg, when) =>
      threshold('ride', e, when, (cp) =>
        metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean),
      ),
  },
}

/**
 * The zones in effect on a date, for every sport and measure that has a reference. Time-in-zones and
 * any other feature that needs zones asks here with an activity's start.
 *
 * A dated setting the athlete entered (settings.measurements) wins: the entry in effect on the local
 * date, by the policy on Measurement. Otherwise the zones come from `estimates` (`zoneEstimatesOf`) and are
 * marked estimated: a heart rate from the library's maximum, the same on every date; a pace or power from the
 * threshold fitted over the half year that ends with the date (settled: see `settledThresholds`), so an activity is
 * cut by the athlete's fitness then, under every period. Where that window cannot support a fit the newest earlier one within a year is
 * used, marked with when its efforts end (`ZoneSet.asOfMs`); beyond that a pace or power has no zones
 * (`missingThresholdZones` says for which). A sport and measure with neither are left out.
 */
export function zonesAt(
  at: number | Dated,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
): ZoneSet[] {
  const when = typeof at === 'number' ? { startMs: at } : at
  const massKg = massAtFor(settings)(when.startMs)
  const sets: ZoneSet[] = []
  for (const sport of Object.keys(ZONE_MEASURES) as Sport[]) {
    for (const measure of ZONE_MEASURES[sport]) {
      const entered = entryAt(
        settings.measurements ?? [],
        ZONE_OVERRIDE[measure],
        sport,
        when.startMs,
      )
      const estimate =
        estimates === null ? null : ESTIMATE[sport][measure]?.(estimates, massKg, when)
      const source: ZoneSource = entered === null ? 'estimated' : 'entered'
      const raw = entered?.value ?? estimate?.reference ?? null
      if (raw === null || !Number.isFinite(raw)) continue
      // A heart rate and a power are whole numbers, and Profile shows the reference as one, so the zones are cut
      // from the number shown: what the athlete sees, 188 bpm, is what the edges are worked out from.
      const reference = WHOLE_NUMBER_MEASURES[measure] ? Math.round(raw) : raw
      if (reference <= 0) continue
      sets.push({
        sport,
        measure,
        source,
        reference,
        estimatedFrom: entered === null ? (estimate?.from ?? []) : [],
        maxHeartRateFrom: entered === null ? (estimate?.maxHeartRateFrom ?? null) : null,
        asOfMs: entered === null ? (estimate?.asOfMs ?? null) : null,
        floorS: entered === null ? (estimate?.floorS ?? null) : null,
        fromHighest: entered === null && estimate?.fromHighest === true,
        citation: ZONE_SCHEMES[measure].citation,
        zones: zonesFor(measure, reference),
      })
    }
  }
  return sets
}
