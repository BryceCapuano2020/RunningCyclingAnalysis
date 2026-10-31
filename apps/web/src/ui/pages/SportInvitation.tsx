import type { Sport } from '@rca/core/types'
import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { otherSport } from '../soleSport'
import { SPORT_NOUN, SPORT_PLURAL } from '../sports'
import './SportInvitation.css'

export interface SportInvitationProps {
  /** The one sport the library holds. */
  sport: Sport
  /** Adds files, as the header's Add files does. */
  onAddFiles: (files: File[]) => void
}

/**
 * The foot of a one-sport Balance: the one thing that would add to the page, as a single row with the file chooser and the
 * guides. It names the sport to add and what it is for; it is not a section, and it replaces the empty card a missing
 * sport used to get.
 */
export function SportInvitation({ sport, onAddFiles }: SportInvitationProps) {
  const other = otherSport(sport)
  return (
    <div className="panel sport-invitation" data-testid="sport-invitation">
      <p className="sport-invitation__text">
        {`Add ${SPORT_PLURAL[other]} to compare them with your ${SPORT_NOUN[sport]}.`}
      </p>
      <div className="sport-invitation__actions">
        <AddSportFiles sport={other} onAddFiles={onAddFiles} />
        <HowToGetFilesButton />
      </div>
    </div>
  )
}
