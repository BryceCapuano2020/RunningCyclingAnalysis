import type { Period } from '@rca/core/period'
import type { Sport } from '@rca/core/types'
import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { SportIcon } from '../components/icons'
import { sportEmptyText } from '../periodCopy'
import { SPORT_LABEL } from '../sports'
import './EmptySportCard.css'

export interface EmptySportCardProps {
  sport: Sport
  /** How many of this sport the library holds, in All time. Zero when the files have none. */
  inLibrary: number
  /** The period on screen, named by its dates in the words. */
  period: Period
  /** Adds files, as the header's Add files does. */
  onAddFiles: (files: File[]) => void
}

/**
 * A sport with nothing in the period on screen: a short prompt rather than a card, so it takes little
 * room beside the sport that has activities. It names the dated period and the count in All time, and
 * offers the same file chooser as the header as a secondary action. It links nowhere, since the
 * sport's page would be empty as well.
 */
export function EmptySportCard({ sport, inLibrary, period, onAddFiles }: EmptySportCardProps) {
  const headingId = `empty-sport-${sport}`
  return (
    <section className="empty-sport" aria-labelledby={headingId}>
      <h2 id={headingId} className="empty-sport__name">
        <SportIcon sport={sport} />
        {SPORT_LABEL[sport]}
      </h2>
      <p className="secondary">{sportEmptyText(sport, period, inLibrary)}</p>
      <div className="empty-sport__actions">
        <AddSportFiles sport={sport} onAddFiles={onAddFiles} />
        <HowToGetFilesButton />
      </div>
    </section>
  )
}
