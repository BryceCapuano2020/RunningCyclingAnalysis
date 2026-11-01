import { profileShortNote } from '@rca/core/profile'
import type { ReadyProfile } from '@rca/core/profile'
import type { Sport } from '@rca/core/types'
import { StandOutChart } from '../charts'
import { effortLabel } from '../records'
import { SPORT_PLURAL } from '../sports'

/**
 * Where a sport's bests stand out from the rest of its own curve, written once and drawn as a strip of every
 * best against the others when something does stand out. It compares an athlete with their other bests and
 * not with anyone else. When the period held too few activities to judge its own, the bests are the whole
 * library's and a few words say so.
 */
export function StandOutSection({
  sport,
  profile,
  allTime,
}: {
  sport: Sport
  profile: ReadyProfile
  allTime: boolean
}) {
  const shortNote = profileShortNote(profile, effortLabel)
  return (
    <>
      {allTime && <p className="muted">{`Based on all your ${SPORT_PLURAL[sport]}.`}</p>}
      {shortNote && <p className="muted">{shortNote}</p>}
      {profile.rows.some((row) => row.standsOut !== null) && (
        <StandOutChart sport={sport} rows={profile.rows} />
      )}
    </>
  )
}
