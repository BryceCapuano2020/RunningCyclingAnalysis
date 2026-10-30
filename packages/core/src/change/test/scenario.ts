import { changeEvidence } from '../evidence'
import type { ChangeVerdict } from '../types'
import type { Sport } from '../../types'
import { DEFAULT_BIKE_MODEL } from '../../constants'
import { DAY_MS } from '../../constants'
import { effortLibrary, MONDAY, SETTINGS } from './library'
import type { Spec } from './library'

/** One comparison: two periods of `weeks` weeks, the second at `planted` (a log change) above the first. */
export interface Scenario extends Omit<Spec, 'weeks' | 'seed' | 'level'> {
  /** Weeks in each period. */
  period: number
  /** Planted change of capability, as a fraction (0.05 is 5% up). */
  planted: number
}

/** The verdict at one length for one seeded library. */
export function verdictOf(scenario: Scenario, seed: number, durationS: number): ChangeVerdict {
  const weeks = scenario.period * 2
  const lift = Math.log(1 + scenario.planted)
  const library = effortLibrary({
    ...scenario,
    weeks,
    seed,
    level: (week) => (week >= scenario.period ? lift : 0),
  })
  const cut = MONDAY + scenario.period * 7 * DAY_MS
  const sport: Sport = scenario.sport
  const evidence = changeEvidence(
    library.filter((digest) => digest.startMs >= cut),
    library.filter((digest) => digest.startMs < cut),
    SETTINGS,
    DEFAULT_BIKE_MODEL,
    null,
  )
  return evidence[sport].find((call) => call.durationS === durationS)!.verdict
}

export interface Rates {
  higher: number
  lower: number
  none: number
  untested: number
}

/** The share of seeds that get each verdict. */
export function rates(scenario: Scenario, durationS: number, seeds: number): Rates {
  const tally = { higher: 0, lower: 0, none: 0, untested: 0 }
  for (let seed = 1; seed <= seeds; seed++) tally[verdictOf(scenario, seed, durationS)]++
  return {
    higher: tally.higher / seeds,
    lower: tally.lower / seeds,
    none: tally.none / seeds,
    untested: tally.untested / seeds,
  }
}
