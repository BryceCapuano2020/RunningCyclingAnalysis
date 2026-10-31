import { DURATIONS_S } from '../constants'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { EVERY_EFFORT } from '../digest/readingRule'
import type { ReadingRule } from '../digest/readingRule'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'
import { CHANGE } from './constants'
import { nullBand } from './null'
import { readingsOf } from './readings'
import type { DurationReadings } from './readings'
import type { ChangeBasis, ChangeCall, ChangeEvidence } from './types'

const SPORTS: readonly Sport[] = ['run', 'ride']

/** Whether a sport's readings have a power source to tell apart: a ride's do. */
const HAS_SOURCE: Record<Sport, boolean> = { run: false, ride: true }

const best = (values: readonly number[]): number =>
  values.reduce((top, v) => (v > top ? v : top), 0)

const enough = (now: number, before: number): boolean =>
  now >= CHANGE.minPerSide && before >= CHANGE.minPerSide && now + before >= CHANGE.minPooled

const measuredOnly = (r: DurationReadings): number[] => r.values.filter((_, i) => r.measured[i])
const countMeasured = (r: DurationReadings): number => r.measured.filter(Boolean).length

/**
 * The readings a call is made from, or null when the periods cannot be compared. A run's are all of them. A ride's
 * are its power-meter readings when both periods have enough of them; failing that, all of them only when neither period
 * has a power-meter reading at all (estimated against estimated); any other mix is a change of source, which the
 * data cannot tell from a change of power.
 */
function chosen(
  sport: Sport,
  now: DurationReadings,
  before: DurationReadings,
): { now: number[]; before: number[]; basis: ChangeBasis } | null {
  if (!HAS_SOURCE[sport]) return { now: now.values, before: before.values, basis: 'all' }
  const [measuredNow, measuredBefore] = [countMeasured(now), countMeasured(before)]
  if (enough(measuredNow, measuredBefore)) {
    return { now: measuredOnly(now), before: measuredOnly(before), basis: 'measured' }
  }
  if (measuredNow === 0 && measuredBefore === 0) {
    return { now: now.values, before: before.values, basis: 'estimated' }
  }
  return null
}

/** The call for one length: the observed ln ratio of the two periods' bests, and whether it leaves the null's band. */
function callFor(
  sport: Sport,
  durationS: number,
  now: DurationReadings,
  before: DurationReadings,
  seed: number,
): ChangeCall {
  const call: ChangeCall = {
    durationS,
    now: now.values.length,
    before: before.values.length,
    basis: 'all',
    observed: null,
    low: null,
    high: null,
    strongLow: null,
    strongHigh: null,
    verdict: 'untested',
  }
  const from = chosen(sport, now, before)
  if (from === null || from.now.length === 0 || from.before.length === 0) return call
  const observed = Math.log(best(from.now) / best(from.before))
  const based = { ...call, basis: from.basis, observed }
  if (!enough(from.now.length, from.before.length)) return based
  const pooled = Float64Array.from([...from.now, ...from.before])
    .sort()
    .reverse()
  const band = nullBand(pooled, from.now.length, seed)
  if (band === null) return based
  return {
    ...based,
    low: band.low,
    high: band.high,
    strongLow: band.strongLow,
    strongHigh: band.strongHigh,
    verdict: observed > band.high ? 'higher' : observed < band.low ? 'lower' : 'none',
  }
}

/**
 * Whether the selected period's best efforts differ from the previous period's by more than chance, at every
 * curve duration, for both sports. For each length the efforts of both periods are pooled and dealt out at random
 * to a "now" side and a "before" side of their real sizes; the band holds 90% of the ln ratios of the two sides'
 * bests. A real ratio outside it is a change, and the band is wide for an athlete whose efforts at that length
 * are few or scattered. Calibrated on the athlete's own efforts: nothing in it is a fixed percentage. See
 * docs/design/change-test.md.
 *
 * The periods are priced alike (the selected period's bike model, the library's ride gate) and read through one rule:
 * the session builds it from the effort gate (`hardEffortRule`), so an effort that heart rate shows was not hard, or a
 * treadmill run, is not a reading, and the sizes the test asks for count the readings that are.
 */
export function changeEvidence(
  selected: ActivityDigest[],
  previous: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null | undefined,
  rule: ReadingRule = EVERY_EFFORT,
): ChangeEvidence {
  const now = readingsOf(selected, settings, bikeModel, gate, rule)
  const before = readingsOf(previous, settings, bikeModel, gate, rule)
  const calls = (sport: Sport, sportIndex: number): ChangeCall[] =>
    DURATIONS_S.map((durationS, i) =>
      callFor(
        sport,
        durationS,
        now[sport][i]!,
        before[sport][i]!,
        CHANGE.seed + sportIndex * 64 + i,
      ),
    )
  return { run: calls(SPORTS[0]!, 0), ride: calls(SPORTS[1]!, 1) }
}
