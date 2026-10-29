import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { AddSportFiles } from '../components/AddSportFiles'
import { AgeGradeBlock } from '../components/AgeGradeBlock'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { WeightNote } from '../components/WeightNote'
import { effortShareLine } from '../effortCaveat'
import { sportGrade } from '../grades'
import { headlineEffort, sportRecords, threshold } from '../records'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { THRESHOLD_FLOOR_LABEL, THRESHOLD_LABEL, THRESHOLD_MEANING } from '../sports'
import { floorThreshold } from '../thresholdFloor'
import { thresholdRange } from '../thresholdRange'
import { unevenNote } from '../unevenNote'
import type { SportPageProps } from './sportPageProps'

export interface SportAnswerProps extends Pick<
  SportPageProps,
  | 'sport'
  | 'result'
  | 'massKg'
  | 'units'
  | 'profile'
  | 'rangeDays'
  | 'emptyText'
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
  inLibrary,
  rangeDays,
  onShowAll,
  onAddFiles,
}: Pick<
  SportAnswerProps,
  'sport' | 'emptyText' | 'inLibrary' | 'rangeDays' | 'onShowAll' | 'onAddFiles'
>) {
  return (
    <section className="section">
      <p className="secondary">{emptyText}</p>
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
 * The sport page's answer, in one slot: the threshold with its range, what it means and the grade of the best
 * 20 minutes; or the prompt for an empty sport, or the note that a ride waits for a body weight. With the
 * threshold refused, an uneven fit's floor is shown in its place under its own label, so the refusal is not said.
 */
export function SportAnswer(props: SportAnswerProps) {
  const { sport, result, massKg, units, profile, count, held } = props
  if (count === 0) return <EmptySport {...props} />
  if (held) return <WeightNote />
  const fitted = threshold(result, sport, massKg, units)
  const hero = fitted ?? floorThreshold(result, sport, massKg, units)
  const range = thresholdRange(result, sport, massKg, units)
  const floorNote = unevenNote(result, sport)
  const headline = profile === null ? null : sportGrade(result, sport, HEADLINE_DURATION_S, profile)
  // The best 20 minutes by heart rate, as one line under the threshold meaning on either sport.
  const heartRateLine = effortShareLine(
    sport,
    result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
  )
  // A floor is a held best, not an estimate, so it is not called one, and the estimate's meaning is not said.
  const label = fitted === null && hero !== null ? THRESHOLD_FLOOR_LABEL : THRESHOLD_LABEL
  return (
    <section className="section" aria-labelledby={`${sport}-threshold`}>
      <h2 id={`${sport}-threshold`} className="eyebrow sport-page__threshold">
        {label[sport]}
      </h2>
      {hero ? (
        <p className="sport-page__hero">
          <span className="hero-number">{hero.value}</span>
          {hero.sub && <span className="sport-page__hero-sub secondary">{hero.sub}</span>}
        </p>
      ) : (
        <p className="secondary">{thresholdNeedsLine(result, sport)}</p>
      )}
      {hero && range && <p className="muted sport-page__range">{range}</p>}
      {hero && floorNote && <p className="muted">{floorNote}</p>}
      {fitted && <p className="muted">{THRESHOLD_MEANING[sport]}</p>}
      {heartRateLine && <p className="muted">{heartRateLine}</p>}
      {headline && (
        <AgeGradeBlock
          sport={sport}
          outcome={headline}
          effort={headlineEffort(sport, sportRecords(result, sport, massKg, units))}
        />
      )}
    </section>
  )
}
