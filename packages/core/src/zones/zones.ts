import { massAtFor } from '../athlete/mass'
import { entryAt } from '../athlete/measurements'
import type { AthleteSettings } from '../athlete/settings'
import { DISTRIBUTION_BINS, PRIORS } from '../constants'
import { EDGE_EPSILON } from '../math'
import type { ReferenceMax } from '../digest/referenceMax'
import type { HeartRateJudgement } from '../digest/setAsideTypes'
import { thresholdAt } from '../digest/thresholdTimelineTypes'
import type { ThresholdTimeline } from '../digest/thresholdTimelineTypes'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import type { Sport } from '../types'
import {
  EDGE_ROUNDING,
  WHOLE_NUMBER_MEASURES,
  ZONE_MEASURES,
  ZONE_OVERRIDE,
  ZONE_SCHEMES,
} from './schemes'
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
}

const estimatesOfJudgement = new WeakMap<HeartRateJudgement, ZoneEstimates>()

/**
 * The references of a whole library's judgement as zone estimates: its maxima, as an analysis of it reports
 * them, and its thresholds over time. The same judgement gives the same object, so what is cached by the
 * estimates is found again.
 */
export function zoneEstimatesOf(judgement: HeartRateJudgement): ZoneEstimates {
  let found = estimatesOfJudgement.get(judgement)
  if (found === undefined) {
    found = {
      runMaxHeartRate: judgement.referenceHr.run,
      rideMaxHeartRate: judgement.referenceHr.ride,
      runObservedMaxHeartRate: judgement.observedMaxHr.run,
      rideObservedMaxHeartRate: judgement.observedMaxHr.ride,
      observedMaxSource: judgement.observedMaxSource,
      thresholds: judgement.thresholdTimeline,
    }
    estimatesOfJudgement.set(judgement, found)
  }
  return found
}

interface Estimated {
  reference: number
  from: Sport[]
  maxHeartRateFrom?: ReferenceMax
  asOfMs?: number
}

type Estimate = (estimates: ZoneEstimates, massKg: number, at: number) => Estimated | null

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
  return { reference, from: ['run', 'ride'] }
}

/**
 * A threshold reference from the sport's fit over the half year that ends with the date, or, when that window
 * holds no fit, the newest earlier one within a year (marked with when its efforts end). `convert` takes the fit's
 * gross metabolic W/kg to the measure's unit.
 */
function threshold(
  sport: Sport,
  estimates: ZoneEstimates,
  at: number,
  convert: (cp: number) => number,
): Estimated | null {
  const found = thresholdAt(estimates.thresholds[sport], at)
  if (found === null) return null
  return {
    reference: convert(found.fit.cp),
    from: [sport],
    ...(found.asOfMs === null ? {} : { asOfMs: found.asOfMs }),
  }
}

/**
 * The app's own reference for each sport and measure, null without one. A ride's threshold is a
 * metabolic W/kg fit, so it becomes watts at the athlete's mass on the date asked for.
 */
const ESTIMATE: Record<Sport, Partial<Record<ZoneMeasure, Estimate>>> = {
  run: {
    heartRate: (e) =>
      heartRate('run', e.runMaxHeartRate, e.runObservedMaxHeartRate, e.observedMaxSource.run),
    pace: (e, _massKg, at) => threshold('run', e, at, metabolicToFlatSpeed),
  },
  ride: {
    heartRate: (e) =>
      heartRate('ride', e.rideMaxHeartRate, e.rideObservedMaxHeartRate, e.observedMaxSource.ride),
    power: (e, massKg, at) =>
      threshold('ride', e, at, (cp) =>
        metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean),
      ),
  },
}

/** The measures whose estimate is a threshold: with no efforts to fit one, they have no zones. */
const THRESHOLD_MEASURES: readonly ZoneMeasure[] = ['pace', 'power']

/**
 * The zones in effect on a date, for every sport and measure that has a reference. Time-in-zones and
 * any other feature that needs zones asks here with an activity's start.
 *
 * A dated setting the athlete entered (settings.measurements) wins: the entry in effect on the local
 * date, by the policy on Measurement. Otherwise the zones come from `estimates` (`zoneEstimatesOf`) and are
 * marked estimated: a heart rate from the library's maximum, the same on every date; a pace or power from the
 * threshold fitted over the half year that ends with the date, so an activity is cut by the athlete's fitness
 * then, under every period. Where that window cannot support a fit the newest earlier one within a year is
 * used, marked with when its efforts end (`ZoneSet.asOfMs`); beyond that a pace or power has no zones
 * (`missingThresholdZones` says for which). A sport and measure with neither are left out.
 */
export function zonesAt(
  at: number,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
): ZoneSet[] {
  const massKg = massAtFor(settings)(at)
  const sets: ZoneSet[] = []
  for (const sport of Object.keys(ZONE_MEASURES) as Sport[]) {
    for (const measure of ZONE_MEASURES[sport]) {
      const entered = entryAt(settings.measurements ?? [], ZONE_OVERRIDE[measure], sport, at)
      const estimate = estimates === null ? null : ESTIMATE[sport][measure]?.(estimates, massKg, at)
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
        citation: ZONE_SCHEMES[measure].citation,
        zones: zonesFor(measure, reference),
      })
    }
  }
  return sets
}

/** A pace or power the athlete has efforts in the sport for but no zones on a date. */
export interface MissingZones {
  sport: Sport
  measure: ZoneMeasure
}

/**
 * The thresholds with no zones on a date although the library holds activities of the sport: no threshold is entered,
 * the half year ending then supports no fit and no earlier fit is within a year. The page says what would give them.
 */
export function missingThresholdZones(
  at: number,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
): MissingZones[] {
  if (estimates === null) return []
  const present = new Set(
    zonesAt(at, settings, estimates).map((set) => `${set.sport}.${set.measure}`),
  )
  return (Object.keys(ZONE_MEASURES) as Sport[]).flatMap((sport) =>
    ZONE_MEASURES[sport]
      .filter((measure) => THRESHOLD_MEASURES.includes(measure))
      .filter(
        (measure) => estimates.thresholds[sport].length > 0 && !present.has(`${sport}.${measure}`),
      )
      .map((measure) => ({ sport, measure })),
  )
}
