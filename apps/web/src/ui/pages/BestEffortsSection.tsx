import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { queryFromView, DEFAULT_VIEW } from '../activitiesView'
import { SportCurveChart } from '../charts'
import { ArrowRightIcon } from '../components/icons'
import { plural } from '../components/plural'
import { formatCount } from '../format/count'
import { SPORT_NOTE, gradeLevelText, sportGrade } from '../grades'
import { activityMasses } from '../activityMasses'
import { notHardNote } from '../changeHeld'
import { activityNames } from '../records'
import { hrefFor } from '../route'
import { SPORT_PLURAL } from '../sports'
import { thresholdLine } from '../thresholdLine'
import { curvesOf } from './bestEffortRows'
import type { BestEffortRows } from './bestEffortRows'
import { RecordTiles } from './RecordTiles'
import { tileRows } from './tileRows'
import type { SectionContext } from './sportPageProps'

/**
 * A sport's best efforts: the curve they make with its findings written on it, and under it a strip of the
 * records the sport is read by. The full list, and where the bests stand out from each other, are behind
 * disclosures further down the page. The heading names the card for a screen reader; the chart's own title
 * and finding are the visible ones.
 */
export function BestEffortsSection(context: SectionContext & { list: BestEffortRows }) {
  const { sport, result, previousLabel, massKg, units, count, profile, list } = context
  const { current, earlier } = curvesOf(context)
  const measuredRides = result.activities.filter(
    (activity) => activity.sport === 'ride' && activity.powerSource === 'measured',
  ).length
  const headline = profile === null ? null : sportGrade(result, sport, HEADLINE_DURATION_S, profile)
  return (
    <section className="section" aria-labelledby={`${sport}-records`}>
      <h2 id={`${sport}-records`} className="sr-only">
        Best efforts
      </h2>
      <SportCurveChart
        sport={sport}
        curve={current}
        previous={earlier && previousLabel ? { curve: earlier, label: previousLabel } : null}
        massKg={massKg}
        units={units}
        activityNames={activityNames(result.activities)}
        activityMasses={activityMasses(result.activities)}
        threshold={thresholdLine(result, sport, massKg, units)}
        bestLevel={headline?.kind === 'graded' ? gradeLevelText(headline.grade) : undefined}
        change={context.change}
        held={
          context.previous && previousLabel
            ? notHardNote(sport, result, context.previous, previousLabel)
            : null
        }
      />
      <RecordTiles tiles={tileRows(sport, list.rows)} />
      {SPORT_NOTE[sport] && <p className="muted">{SPORT_NOTE[sport]}</p>}
      {sport === 'ride' && list.someEstimated && (
        <p className="muted">
          {`Power meters measured ${formatCount(measuredRides)} of ${plural(count, 'ride', 'rides')}. Watts for the rest are estimated.`}{' '}
          <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
        </p>
      )}
      <a className="link-arrow" href={`#/activities?${queryFromView({ ...DEFAULT_VIEW, sport })}`}>
        {`See your ${SPORT_PLURAL[sport]}`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
