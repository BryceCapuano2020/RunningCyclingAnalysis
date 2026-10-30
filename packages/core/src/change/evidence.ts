import { DURATIONS_S } from '../constants'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'
import { CHANGE } from './constants'
import { nullBand } from './null'
import { readingsOf } from './readings'
import type { ChangeCall, ChangeEvidence } from './types'

const SPORTS: readonly Sport[] = ['run', 'ride']

const best = (values: readonly number[]): number =>
  values.reduce((top, v) => (v > top ? v : top), 0)

/** The call for one length: the observed ln ratio of the two periods' bests, and whether it leaves the null's band. */
function callFor(
  durationS: number,
  now: readonly number[],
  before: readonly number[],
  seed: number,
): ChangeCall {
  const observed = now.length > 0 && before.length > 0 ? Math.log(best(now) / best(before)) : null
  const call: ChangeCall = {
    durationS,
    now: now.length,
    before: before.length,
    observed,
    low: null,
    high: null,
    verdict: 'untested',
  }
  const enough =
    now.length >= CHANGE.minPerSide &&
    before.length >= CHANGE.minPerSide &&
    now.length + before.length >= CHANGE.minPooled
  if (!enough || observed === null) return call
  const pooled = Float64Array.from([...now, ...before])
    .sort()
    .reverse()
  const band = nullBand(pooled, now.length, seed)
  if (band === null) return call
  const verdict = observed > band.high ? 'higher' : observed < band.low ? 'lower' : 'none'
  return { ...call, low: band.low, high: band.high, verdict }
}

/**
 * Whether the selected period's best efforts differ from the previous period's by more than chance, at every
 * curve duration, for both sports. For each length the efforts of both periods are pooled and dealt out at random
 * to a "now" side and a "before" side of their real sizes; the band holds 90% of the ln ratios of the two sides'
 * bests. A real ratio outside it is a change, and the band is wide for an athlete whose efforts at that length
 * are few or scattered. Calibrated on the athlete's own efforts: nothing in it is a fixed percentage. See
 * docs/design/change-test.md.
 *
 * The periods are priced alike: the selected period's bike model, the library's ride gate.
 */
export function changeEvidence(
  selected: ActivityDigest[],
  previous: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null | undefined,
): ChangeEvidence {
  const now = readingsOf(selected, settings, bikeModel, gate)
  const before = readingsOf(previous, settings, bikeModel, gate)
  const calls = (sport: Sport, sportIndex: number): ChangeCall[] =>
    DURATIONS_S.map((durationS, i) =>
      callFor(durationS, now[sport][i]!, before[sport][i]!, CHANGE.seed + sportIndex * 64 + i),
    )
  return { run: calls(SPORTS[0]!, 0), ride: calls(SPORTS[1]!, 1) }
}
