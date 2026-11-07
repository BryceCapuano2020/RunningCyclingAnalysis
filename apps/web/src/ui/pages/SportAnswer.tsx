import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightNote } from '../components/WeightNote'
import { thresholdGrade } from '../thresholdGrade'
import { SportHero } from './SportHero'
import type { SportPageProps } from './sportPageProps'
import './SportHero.css'

export interface SportAnswerProps extends Pick<
  SportPageProps,
  | 'sport'
  | 'result'
  | 'massKg'
  | 'units'
  | 'profile'
  | 'missingAge'
  | 'rangeDays'
  | 'emptyText'
  | 'leftOut'
  | 'inLibrary'
  | 'onShowAll'
  | 'onAddFiles'
> {
  /** How many of the sport's activities the period holds. */
  count: number
  /** Whether the page holds the sport's figures for the body weight a ride needs. */
  held: boolean
}

/** What a sport with nothing in the period says, and the one action that leads out of it. */
function EmptySport({
  sport,
  emptyText,
  leftOut,
  inLibrary,
  rangeDays,
  onShowAll,
  onAddFiles,
}: Pick<
  SportAnswerProps,
  'sport' | 'emptyText' | 'leftOut' | 'inLibrary' | 'rangeDays' | 'onShowAll' | 'onAddFiles'
>) {
  return (
    <section className="section">
      <p className="secondary">{emptyText}</p>
      {leftOut !== undefined && (
        <CountWalkingRuns count={leftOut.count} onCount={leftOut.onCount} />
      )}
      {inLibrary === 0 ? (
        <div className="sport-page__actions">
          <AddSportFiles sport={sport} onAddFiles={onAddFiles} />
          <HowToGetFilesButton />
        </div>
      ) : (
        rangeDays !== null &&
        onShowAll && (
          <button type="button" className="btn" onClick={onShowAll}>
            Show all time
          </button>
        )
      )}
    </section>
  )
}

/**
 * The sport page's answer, in one slot: the hero of current status (SportHero); or the prompt for an empty sport, or the note that a ride waits for
 * a body weight.
 */
export function SportAnswer(props: SportAnswerProps) {
  const { sport, result, massKg, units, profile, missingAge, count, held } = props
  if (count === 0) return <EmptySport {...props} />
  if (held) return <WeightNote />
  const headline = profile === null ? null : thresholdGrade(result, sport, profile)
  return (
    <SportHero
      sport={sport}
      result={result}
      massKg={massKg}
      units={units}
      outcome={headline}
      missingAge={missingAge}
    />
  )
}
