import { plural } from '../components/plural'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'

/** The answer's estimates line when no run has a usable effort to count. */
const NO_RUN_EFFORT = 'No run has a usable effort yet.'
/** Line two of the answer while a ride's grade waits for the weight. */
const WAITS_FOR_WEIGHT = 'Your balance waits for your weight.'

/** What the range says of a dead heat: outside it the lean is firm, inside it the model cannot rule one out. */
const DEAD_HEAT_OUTSIDE = 'A dead heat is outside the range, so the lean is real.'
const DEAD_HEAT_INSIDE = 'A dead heat is inside the range, so the lean could go either way.'

/**
 * Line two of the answer: which way the balance leans, in Balance's words, and whether a dead heat is inside
 * the range the model gives. Null while no balance is stated.
 */
export function answerVerdict(
  balance: BalanceReading | null,
  waitsForWeight: boolean,
): string | null {
  if (waitsForWeight) return WAITS_FOR_WEIGHT
  if (balance === null) return null
  const { low, high } = balance.lead
  const dead = low <= 0 && high >= 0 ? DEAD_HEAT_INSIDE : DEAD_HEAT_OUTSIDE
  return `${balanceTitle(balance)}. ${dead}`
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
