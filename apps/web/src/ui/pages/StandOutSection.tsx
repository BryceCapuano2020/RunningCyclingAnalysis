import { profileShortNote } from '@rca/core/profile'
import type { ReadyProfile } from '@rca/core/profile'
import type { Sport } from '@rca/core/types'
import { StandOutChart } from '../charts'
import { effortLabel } from '../records'

/**
 * Where a sport's bests stand out from the rest of its own curve, written once and drawn as a strip of every
 * best against the others when something does stand out. It compares an athlete with their other bests and
 * not with anyone else. When the period held too few activities to judge its own, the bests are the whole
 * library's, and the sentence on the section's row says "all-time".
 */
export function StandOutSection({ sport, profile }: { sport: Sport; profile: ReadyProfile }) {
  const shortNote = profileShortNote(profile, effortLabel)
  return (
    <>
      {shortNote && <p className="muted">{shortNote}</p>}
      {profile.rows.some((row) => row.standsOut !== null) && (
        <StandOutChart sport={sport} rows={profile.rows} />
      )}
    </>
  )
}
