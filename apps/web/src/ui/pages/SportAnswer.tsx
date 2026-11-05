import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightNote } from '../components/WeightNote'
import { indoorSplitLine } from '../indoorCopy'
import { threshold } from '../records'
import { thresholdGrade } from '../thresholdGrade'
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
 * the threshold; or the prompt for an empty sport, or the note that a ride waits for a body weight. With no threshold
 * estimate, the panel asks for the effort that would give one.
 */
export function SportAnswer(props: SportAnswerProps) {
  const { sport, result, massKg, units, profile, missingAge, count, held } = props
  if (count === 0) return <EmptySport {...props} />
  if (held) return <WeightNote />
  const headline = profile === null ? null : thresholdGrade(result, sport, profile)
  // The split between indoor and outdoor, said once, under the answer it qualifies.
  const split = indoorSplitLine(result.activities, sport)
  return (
    <>
      <div className="band sport-hero" data-sport={sport}>
        <ThresholdPanel sport={sport} result={result} massKg={massKg} units={units} />
        <LevelPanel
          sport={sport}
          outcome={headline}
          effort={threshold(result, sport, massKg, units)?.value ?? null}
          missingAge={missingAge}
        />
      </div>
      {split === null ? null : (
        <p className="muted sport-hero__source" data-testid="indoor-split">
          {split}
        </p>
      )}
    </>
  )
}
