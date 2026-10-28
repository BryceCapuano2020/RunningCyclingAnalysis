import { plural } from '../components/plural'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'

/** The answer's estimates line when no run has a usable effort to count. */
const NO_RUN_EFFORT = 'No run has a usable effort yet.'
/** Line two of the answer while a ride's grade waits for the weight. */
const WAITS_FOR_WEIGHT = 'Your balance waits for your weight.'

/**
 * Line two of the answer: which way the balance leans, in Balance's words, and whether even is inside
 * the range the model gives. Null while no balance is stated.
 */
export function answerVerdict(
  balance: BalanceReading | null,
  waitsForWeight: boolean,
): string | null {
  if (waitsForWeight) return WAITS_FOR_WEIGHT
  if (balance === null) return null
  const even = balance.lean === 'even' ? 'inside' : 'outside'
  return `${balanceTitle(balance)}. Even is ${even} its range.`
}

/**
 * The estimates line of the answer, once there are results: what the library's counts estimate. A ride
 * figure needs the weight and a ride, and a run threshold needs a run, so the line names only those.
 */
export function estimatesOf(runs: number, rides: number, weightKnown: boolean): string {
  if (!weightKnown || rides === 0) {
    if (runs === 0) return NO_RUN_EFFORT
    return `Run thresholds are estimates from ${plural(runs, 'run')} with a usable effort.`
  }
  if (runs === 0) {
    return `Ride levels and ride power without a meter are estimates from ${plural(rides, 'ride')} with a usable effort.`
  }
  return `Thresholds, ride levels, the balance and ride power without a meter are estimates from ${plural(runs, 'run')} and ${plural(rides, 'ride')} with a usable effort.`
}
