import { LATE_IN_EFFORT } from '@rca/core/constants'
import type { LateEvidence } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { SPORT_PLURAL } from './sports'

const { minActivities } = LATE_IN_EFFORT

/** What a sport's late bests need of a file besides its length. */
const NEEDS_DEVICE: Record<Sport, string> = {
  run: '',
  ride: ' with a power meter',
}

/** What drift needs of a file besides its length: a heart rate, and for a ride a power meter. Keyed by Sport. */
const DRIFT_NEEDS_DEVICE: Record<Sport, string> = {
  run: 'heart rate',
  ride: 'a power meter and heart rate',
}

/** What the library holds toward a reading, as the most it can hold while the reading is still out of reach. */
const heldOf = (count: number) => Math.min(count, minActivities - 1)

/** The activities behind a late best, at most: the sessions that went on long enough to have one. */
function longSessions(evidence: LateEvidence): number {
  const counts = evidence.durability.flatMap((row) =>
    row.after.map((after) => after.best?.supporters ?? 0),
  )
  return heldOf(Math.max(0, ...counts))
}

/** What the library has of durability's sessions: "Durability: 1 of 3 rides longer than an hour with a power meter." */
function durabilityNeed(sport: Sport, evidence: LateEvidence): string {
  return `Durability: ${longSessions(evidence)} of ${minActivities} ${SPORT_PLURAL[sport]} longer than an hour${NEEDS_DEVICE[sport]}.`
}

/** The steady efforts over an hour that drift reads, as a count of the library's and what each needs. */
function steadyEfforts(sport: Sport, evidence: LateEvidence): string {
  return `${heldOf(evidence.drift.length)} of ${minActivities} steady ${SPORT_PLURAL[sport]} over an hour with ${DRIFT_NEEDS_DEVICE[sport]}.`
}

/**
 * What the library has toward the readings it cannot give, one line each, with real counts: a half with too little
 * behind it is named under the other, and with neither, steady efforts over an hour give each, so one line says how
 * many there are. Empty when nothing is missing.
 */
export function lateNeeds(
  sport: Sport,
  evidence: LateEvidence,
  has: { durability: boolean; drift: boolean },
): string[] {
  if (!has.durability && !has.drift) return [steadyEfforts(sport, evidence)]
  return [
    ...(has.durability ? [] : [durabilityNeed(sport, evidence)]),
    ...(has.drift ? [] : [`Heart rate drift: ${steadyEfforts(sport, evidence)}`]),
  ]
}
