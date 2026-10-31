import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightNote } from '../components/WeightNote'
import { sportGrade } from '../grades'
import { headlineEffort, sportRecords } from '../records'
import { LevelPanel } from './LevelPanel'
import type { SportPageProps } from './sportPageProps'
import { ThresholdPanel } from './ThresholdPanel'
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
 * The sport page's answer, in one slot: the threshold with its range and what it means beside the level of
 * the best 20 minutes; or the prompt for an empty sport, or the note that a ride waits for a body weight.
 * With the threshold refused, an uneven fit's floor is shown in its place under its own label, so the
 * refusal is not said.
 */
export function SportAnswer(props: SportAnswerProps) {
  const { sport, result, massKg, units, profile, missingAge, count, held, rangeDays } = props
  if (count === 0) return <EmptySport {...props} />
  if (held) return <WeightNote />
  const headline = profile === null ? null : sportGrade(result, sport, HEADLINE_DURATION_S, profile)
  return (
    <div className="sport-hero" data-sport={sport}>
      <ThresholdPanel
        sport={sport}
        result={result}
        massKg={massKg}
        units={units}
        rangeDays={rangeDays}
      />
      <LevelPanel
        sport={sport}
        outcome={headline}
        effort={headlineEffort(sport, sportRecords(result, sport, massKg, units))}
        missingAge={missingAge}
      />
    </div>
  )
}
