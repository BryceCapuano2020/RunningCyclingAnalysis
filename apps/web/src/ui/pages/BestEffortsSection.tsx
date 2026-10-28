import { queryFromView, DEFAULT_VIEW } from '../activitiesView'
import { SportCurveChart } from '../charts'
import { ArrowRightIcon } from '../components/icons'
import { plural } from '../components/plural'
import { SportRecords } from '../components/SportRecords'
import { formatCount } from '../format/count'
import { DISTANCE_TIMES_NOTE, SPORT_NOTE } from '../grades'
import { activityMasses } from '../activityMasses'
import { activityNames } from '../records'
import { hrefFor } from '../route'
import { formLine } from '../sportForm'
import { SPORT_PLURAL } from '../sports'
import { bestEffortRows, curvesOf } from './bestEffortRows'
import { StandOutCaption } from './StandOutCaption'
import type { SectionContext } from './sportPageProps'
import type { AgeGap } from '../grades'

/** The age grades need the field that is missing: asked once here, under the best efforts. */
function AgeNote({ missing }: { missing: AgeGap }) {
  return (
    <p className="muted">
      {`Age grades need your ${missing}.`}{' '}
      <a href={hrefFor({ page: 'profile' })}>{`Add your ${missing}`}</a>
    </p>
  )
}

/**
 * A sport's best efforts: the records in its own units, the curve they sit on directly under the list,
 * and where the bests stand out from each other as the curve's caption.
 */
export function BestEffortsSection(context: SectionContext) {
  const { sport, result, previousLabel, massKg, units, missingAge, openedAt, count } = context
  const list = bestEffortRows(context)
  const { current, earlier } = curvesOf(context)
  const measuredRides = result.activities.filter(
    (activity) => activity.sport === 'ride' && activity.powerSource === 'measured',
  ).length
  // The time the page was opened at, so a year shows only when the last run is from an earlier year.
  const form = formLine(result.activities, sport, units, openedAt)
  return (
    <section className="section" aria-labelledby={`${sport}-records`}>
      <h2 id={`${sport}-records`}>Best efforts</h2>
      {form && <p className="muted">{form}</p>}
      {missingAge !== null && <AgeNote missing={missingAge} />}
      {sport === 'ride' && list.someEstimated && (
        <p className="muted">
          {`Power meters measured ${formatCount(measuredRides)} of ${plural(count, 'ride', 'rides')}. Watts for the rest are estimated.`}{' '}
          <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
        </p>
      )}
      <SportRecords rows={list.rows} />
      {list.distanceCount > 0 && <p className="muted">{DISTANCE_TIMES_NOTE}</p>}
      {list.listNotes.map((note) => (
        <p key={note} className="muted">
          {note}
        </p>
      ))}
      {SPORT_NOTE[sport] && <p className="muted">{SPORT_NOTE[sport]}</p>}
      {list.partial && (
        <p className="muted">
          Runs added before distance bests were recorded don’t have them yet, so these may not be
          the fastest. Add those runs again to include them.
        </p>
      )}
      <SportCurveChart
        sport={sport}
        curve={current}
        previous={earlier && previousLabel ? { curve: earlier, label: previousLabel } : null}
        massKg={massKg}
        units={units}
        activityNames={activityNames(result.activities)}
        activityMasses={activityMasses(result.activities)}
      />
      <StandOutCaption sport={sport} result={result} />
      <a className="link-arrow" href={`#/activities?${queryFromView({ ...DEFAULT_VIEW, sport })}`}>
        {`See your ${SPORT_PLURAL[sport]}`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
