import type { ReadyProfile } from '@rca/core/profile'
import type { Sport } from '@rca/core/types'
import { StandOutChart } from '../charts'

/**
 * Where a sport's bests stand out from the rest of its own curve, written once on the section's row and drawn as a
 * strip of every best against the others when something does stand out. It compares an athlete with their other
 * bests and not with anyone else. When the period held too few activities to judge its own, the bests are the whole
 * library's, and the sentence on the row says "all-time".
 */
export function StandOutSection({ sport, profile }: { sport: Sport; profile: ReadyProfile }) {
  return profile.rows.some((row) => row.standsOut !== null) ? (
    <StandOutChart sport={sport} rows={profile.rows} />
  ) : null
}
