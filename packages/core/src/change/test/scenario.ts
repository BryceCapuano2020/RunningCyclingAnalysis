import { DAY_MS, DEFAULT_BIKE_MODEL } from '../../constants'
import type { Sport } from '../../types'
import { changeEvidence } from '../evidence'
import { verdictOfCall } from '../types'
import type { ChangeCall, ChangeEvidence } from '../types'
import { effortLibrary, MONDAY, SETTINGS } from './library'
import type { Spec } from './library'
import type { ActivityDigest } from '../../types'

/** One comparison: two periods of `period` weeks, the second at `planted` (a log change) above the first. */
export interface Scenario extends Omit<Spec, 'weeks' | 'seed' | 'level'> {
  /** Weeks in each period. */
  period: number
  /** Planted change of capability, as a fraction (0.05 is 5% up). */
  planted: number
}

/** The library of one seeded comparison and the week it divides at. */
export function libraryOf(scenario: Scenario, seed: number): ActivityDigest[] {
  const lift = Math.log(1 + scenario.planted)
  return effortLibrary({
    ...scenario,
    weeks: scenario.period * 2,
    seed,
    level: (week) => (week >= scenario.period ? lift : 0),
  })
}

/** The evidence of two periods of one library divided at `periodWeeks`. */
export function evidenceOf(library: ActivityDigest[], periodWeeks: number): ChangeEvidence {
  const cut = MONDAY + periodWeeks * 7 * DAY_MS
  return changeEvidence(
    library.filter((digest) => digest.startMs >= cut),
    library.filter((digest) => digest.startMs < cut),
    SETTINGS,
    DEFAULT_BIKE_MODEL,
    null,
  )
}

/** The call at one length for one seeded library. */
export function callOf(scenario: Scenario, seed: number, durationS: number): ChangeCall {
  const sport: Sport = scenario.sport
  const evidence = evidenceOf(libraryOf(scenario, seed), scenario.period)
  return evidence[sport].find((call) => call.durationS === durationS)!
}

export interface Rates {
  /** Called higher or lower at the record level (90% band). */
  higher: number
  lower: number
  /** Called at the headline level (95% band), either way. */
  strong: number
  none: number
  untested: number
  /** The median |ln ratio| of the two periods' bests where both have one. */
  medianAbs: number
}

const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN

/** The share of seeds that get each verdict at a length. */
export function rates(scenario: Scenario, durationS: number, seeds: number): Rates {
  const tally = { higher: 0, lower: 0, strong: 0, none: 0, untested: 0 }
  const observed: number[] = []
  for (let seed = 1; seed <= seeds; seed++) {
    const call = callOf(scenario, seed, durationS)
    tally[call.verdict]++
    const headline = verdictOfCall(call, 'headline')
    if (headline === 'higher' || headline === 'lower') tally.strong++
    if (call.observed !== null) observed.push(Math.abs(call.observed))
  }
  return {
    higher: tally.higher / seeds,
    lower: tally.lower / seeds,
    strong: tally.strong / seeds,
    none: tally.none / seeds,
    untested: tally.untested / seeds,
    medianAbs: median(observed),
  }
}
