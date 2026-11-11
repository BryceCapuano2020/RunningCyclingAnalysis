import { AddSportFiles } from '../components/AddSportFiles'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { CountWalkingRuns } from '../components/WalkingChoice'
import { WeightNote } from '../components/WeightNote'
import { sportHalfFor } from '../runHalf'
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
  | 'heartRateJudgement'
  | 'periodEndMs'
  | 'emptyText'
  | 'leftOut'
  | 'inLibrary'
  | 'onShowAll'
  | 'onAddFiles'
> {
  /** The previous period's thresholds and label, which the hero's change reads. Absent: all time. */
  previousThresholds?: SportPageProps['previousThresholds']
  previousLabel?: string | null
  /** The library the run's forecast half is asked of, as the Run page's predictions ask it. Absent: the period alone. */
  library?: SportPageProps['library']
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
  const { previousThresholds = null, previousLabel = null } = props
  if (count === 0) return <EmptySport {...props} />
  if (held) return <WeightNote />
  // A run is graded by the half its race predictions forecast, the one Balance grades it by; a ride by its threshold.
  const half = sportHalfFor(sport, {
    result,
    rangeDays: props.rangeDays,
    library: props.library ?? [],
    heartRateJudgement: props.heartRateJudgement,
    periodEndMs: props.periodEndMs,
  })
  const headline = profile === null ? null : thresholdGrade(result, sport, profile, half)
  return (
    <SportHero
      sport={sport}
      result={result}
      previousThresholds={previousThresholds}
      previousLabel={previousLabel}
      massKg={massKg}
      units={units}
      outcome={headline}
      missingAge={missingAge}
    />
  )
}
