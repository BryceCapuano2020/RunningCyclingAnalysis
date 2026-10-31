import { DURATIONS_S } from '../constants'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { EVERY_EFFORT } from '../digest/readingRule'
import type { ReadingRule } from '../digest/readingRule'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'
import { CHANGE } from './constants'
import { nullBand } from './null'
import { readingsOf } from './readings'
import type { DurationReadings, Readings } from './readings'
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
    gated: false,
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
 * The periods are priced alike (the selected period's bike model, the library's ride gate). With a reading rule (the
 * session builds it from the effort gate, `hardEffortRule`) the call is made from the efforts heart rate shows hard in
 * both periods when both hold enough of them (`gated`), else from every effort in both: the two periods are always read
 * alike. A treadmill run is no reading either way.
 */
export function changeEvidence(
  selected: ActivityDigest[],
  previous: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null | undefined,
  rule: ReadingRule = EVERY_EFFORT,
): ChangeEvidence {
  const every = [
    readingsOf(selected, settings, bikeModel, gate, EVERY_EFFORT),
    readingsOf(previous, settings, bikeModel, gate, EVERY_EFFORT),
  ] as const
  // The gated reading is read only when there is a rule to gate by.
  const gated =
    rule === EVERY_EFFORT
      ? null
      : ([
          readingsOf(selected, settings, bikeModel, gate, rule),
          readingsOf(previous, settings, bikeModel, gate, rule),
        ] as const)
  const calls = (sport: Sport, sportIndex: number): ChangeCall[] =>
    DURATIONS_S.map((durationS, i) => {
      const seed = CHANGE.seed + sportIndex * 64 + i
      // Like for like: the call is made from the efforts heart rate shows hard in both periods when both hold enough of them,
      // else from every effort in both. Never the hard ones of one period against every effort of the other.
      if (gated !== null) {
        const hard = callFor(sport, durationS, gated[0][sport][i]!, gated[1][sport][i]!, seed)
        if (hard.verdict !== 'untested') return Object.assign({}, hard, { gated: true })
      }
      return callFor(sport, durationS, every[0][sport][i]!, every[1][sport][i]!, seed)
    })
  return { run: calls(SPORTS[0]!, 0), ride: calls(SPORTS[1]!, 1) }
}

/**
 * The call for one length, for a reader that sets two stretches of the history against each other (two calendar years),
 * made exactly as `changeEvidence` makes it for that length, so a pair of periods and a pair of years are judged alike.
 */
export function changeCallBetween(
  sport: Sport,
  durationS: number,
  now: Readings,
  before: Readings,
): ChangeCall {
  const index = (DURATIONS_S as readonly number[]).indexOf(durationS)
  return callFor(
    sport,
    durationS,
    now[sport][index]!,
    before[sport][index]!,
    CHANGE.seed + SPORTS.indexOf(sport) * 64 + index,
  )
}
