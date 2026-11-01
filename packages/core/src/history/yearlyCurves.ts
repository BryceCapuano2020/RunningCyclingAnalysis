import { ownRideGate } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { ofSport } from '../digest/ordered'
import { trustedPower } from '../digest/powerCheck'
import { fitBikeModelOver, sportCurves } from '../digest/rideCurves'
import { memoByDigests, sameSet } from '../digestMemo'
import { hasEstimatedRide } from '../records/progression'
import type { ActivityDigest, CurvePoint, Sport, SportCurves } from '../types'
import { isEstimated } from './estimated'
import { shownHard } from './hardness'
import type { HistoryInput } from './types'
import { yearOfDigest } from './yearOf'

/** One calendar year's best efforts, from the same curve code the sport pages use. */
export interface CurvesOfYear {
  year: number
  /** The year's activities by id, to judge the effort that holds a best. */
  byId: ReadonlyMap<string, ActivityDigest>
  curves: SportCurves
}

/** The library's own estimated-ride gate, worked out only where a ride has an estimate for it to judge (a meter's points all hold). */
function gateOf(trusted: ActivityDigest[]): EstimatedRideGate | null {
  return hasEstimatedRide(trusted) ? ownRideGate(trusted) : null
}

/**
 * The best curves of each calendar year that has activities, oldest first: `sportCurves` over that year's digests, so an
 * indoor run holds no best and a ride whose power is set aside holds none. One bike model and one estimated-ride gate
 * price every year, so a change between two years is never a change of model.
 */
function curvesOfYears(digests: ActivityDigest[], input: HistoryInput): CurvesOfYear[] {
  const masses = massesOf(input.settings)
  const bikeModel = fitBikeModelOver(ofSport(digests, 'ride'), masses).model
  const gate = input.gate === undefined ? gateOf(trustedPower(digests, masses)) : input.gate
  const inYear = new Map<number, ActivityDigest[]>()
  for (const digest of digests) {
    const year = yearOfDigest(digest)
    const own = inYear.get(year)
    if (own === undefined) inYear.set(year, [digest])
    else own.push(digest)
  }
  return [...inYear]
    .sort(([a], [b]) => a - b)
    .map(([year, own]) => ({
      year,
      byId: new Map(own.map((digest) => [digest.id, digest])),
      curves: sportCurves(own, input.settings, bikeModel, gate),
    }))
}

/** Whether two inputs price the rides alike: the masses, the athlete's kept power, and the library's estimated-ride gate. */
export function sameRidePricing(a: HistoryInput, b: HistoryInput): boolean {
  return (
    a.gate === b.gate &&
    a.settings.massKg === b.settings.massKg &&
    a.settings.bikeMassKg === b.settings.bikeMassKg &&
    a.settings.measurements === b.settings.measurements &&
    a.settings.massAssumed === b.settings.massAssumed &&
    sameSet(new Set(a.settings.keepPower), new Set(b.settings.keepPower))
  )
}

/** Whether two inputs judge hardness alike: the same heart rates set aside, and the same reference to judge them by. */
export function sameHardness(a: HistoryInput, b: HistoryInput): boolean {
  return (
    sameSet(a.setAside, b.setAside) &&
    JSON.stringify(a.effortReference) === JSON.stringify(b.effortReference)
  )
}

/** The years' curves are shared by the parts that read them, so a library makes them once for both. */
export const curvesByYear = memoByDigests(curvesOfYears, sameRidePricing)

/**
 * Whether heart rate shows the effort behind a curve point was hard. A value carried down from a longer effort is judged
 * by that effort's length. A point with no activity behind it is not shown hard.
 */
export function pointShownHard(
  year: CurvesOfYear,
  point: CurvePoint,
  input: HistoryInput,
): boolean {
  const digest = point.activityId === null ? undefined : year.byId.get(point.activityId)
  return (
    digest !== undefined && shownHard(digest, Math.max(point.durationS, point.windowS ?? 0), input)
  )
}

/** Whether the effort behind a curve point of a sport is estimated (see `isEstimated`). */
export function pointEstimated(year: CurvesOfYear, sport: Sport, point: CurvePoint): boolean {
  return isEstimated(sport, point.activityId === null ? undefined : year.byId.get(point.activityId))
}
