import { plural } from '../components/plural'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle, isPoint, leadSentence, rangeText } from '../components/headlineText'

/** The answer's estimates line when no run has a usable effort to count. */
const NO_RUN_EFFORT = 'No run has a usable effort yet.'
/** Line two of the answer while a ride's grade waits for the weight. */
const WAITS_FOR_WEIGHT = 'Your balance waits for your weight.'

/** What the range says of level: across it the lean is close, on one side of it the lean stands. */
const RANGE_CROSSES_LEVEL = 'The range crosses level, so treat this as close.'
const RANGE_ONE_SIDE = 'The range stays on one side of level.'

/** The lead and its range, as one sentence after the lean: a level balance has no lead, so it gives the range alone. */
function rangeSentence(balance: BalanceReading): string | null {
  const lead = leadSentence(balance)
  if (lead !== null) return `${lead}.`
  return isPoint(balance) ? null : `The range is ${rangeText(balance)}.`
}

/**
 * Line two of the answer, in this order: which way the balance leans, in Balance's words, then its lead and
 * range, then whether the range crosses level. Null while no balance is stated.
 */
export function answerVerdict(
  balance: BalanceReading | null,
  waitsForWeight: boolean,
): string | null {
  if (waitsForWeight) return WAITS_FOR_WEIGHT
  if (balance === null) return null
  const { low, high } = balance.lead
  const crosses = low <= 0 && high >= 0
  return [
    `${balanceTitle(balance)}.`,
    rangeSentence(balance),
    crosses ? RANGE_CROSSES_LEVEL : RANGE_ONE_SIDE,
  ]
    .filter((sentence) => sentence !== null)
    .join(' ')
}

/**
 * The estimates line of the answer, once there are results: what the library's counts estimate. A ride
 * figure needs the weight and a ride, and a run threshold needs a run, so the line names only those.
 */
export function estimatesOf(runs: number, rides: number, weightKnown: boolean): string {
  if (!weightKnown || rides === 0) {
    if (runs === 0) return NO_RUN_EFFORT
    return `Run thresholds are estimates. They rest on ${plural(runs, 'run')} with a usable effort.`
  }
  if (runs === 0) {
    return `Ride levels and ride power without a meter are estimates. They rest on ${plural(rides, 'ride')} with a usable effort.`
  }
  return `Thresholds, ride levels, the balance and ride power without a meter are estimates. They rest on ${plural(runs, 'run')} and ${plural(rides, 'ride')} with a usable effort.`
}
