import type { Property } from '../components/property'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle, leadSentence } from '../components/headlineText'

/** The answer's estimates line when no run has a usable effort to count. */
const NO_RUN_EFFORT = 'No run has a usable effort yet.'
/** Line two of the answer while a ride's grade waits for the weight. */
const WAITS_FOR_WEIGHT = 'Your balance waits for your weight.'

/**
 * Line two of the answer: which way the balance leans, in Balance's words, then its lead, as one line. The range and
 * where it sits against level are rows behind Details (`answerRows`). Null while no balance is stated.
 */
export function answerVerdict(
  balance: BalanceReading | null,
  waitsForWeight: boolean,
): string | null {
  if (waitsForWeight) return WAITS_FOR_WEIGHT
  if (balance === null) return null
  const lead = leadSentence(balance)
  return lead === null ? `${balanceTitle(balance)}.` : `${balanceTitle(balance)}. ${lead}.`
}

/** What each library's estimates are, by what it holds: a run has thresholds, a ride has levels and power without a meter. */
function estimatedNames(runs: number, rides: number, weightKnown: boolean): string | null {
  if (!weightKnown || rides === 0) return runs === 0 ? null : 'Run thresholds'
  if (runs === 0) return 'Ride levels and ride power without a meter'
  return 'Thresholds, ride levels, the balance and ride power without a meter'
}

/** The face line while no balance is stated: what is estimated, or that no run has a usable effort. */
export function estimatesOf(runs: number, rides: number, weightKnown: boolean): string {
  const names = estimatedNames(runs, rides, weightKnown)
  return names === null ? NO_RUN_EFFORT : `${names} are estimates.`
}

/**
 * The answer's rows behind Details, label over value: whether the balance's range crosses level, what is estimated and
 * how many runs and rides it rests on. A figure a count of runs or rides, never a sentence about them.
 */
export function answerRows(
  balance: BalanceReading | null,
  runs: number,
  rides: number,
  weightKnown: boolean,
): Property[] {
  const names = estimatedNames(runs, rides, weightKnown)
  const counts: Property[] = [{ label: 'Runs with a usable effort', value: String(runs) }]
  if (weightKnown && rides > 0) {
    counts.push({ label: 'Rides with a usable effort', value: String(rides) })
  }
  return [
    ...(balance === null
      ? []
      : [{ label: 'Range crosses level', value: crossesLevel(balance) ? 'Yes' : 'No' }]),
    ...(names === null ? [] : [{ label: 'Estimated', value: names }]),
    ...(names === null ? [{ label: 'Runs with a usable effort', value: 'None yet' }] : counts),
  ]
}

function crossesLevel({ lead }: BalanceReading): boolean {
  return lead.low <= 0 && lead.high >= 0
}
