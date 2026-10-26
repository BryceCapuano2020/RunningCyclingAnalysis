import type { MouseEvent } from 'react'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import type { Period } from '@rca/core/period'
import { betweenClause } from '../periodCopy'
import type { DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
} from '@rca/core/units'
import { RouteOffer } from '../components/RouteOffer'
import { RouteShape as RouteOutline } from '../components/RouteShape'
import { SportIcon } from '../components/icons'
import { keyByContent } from '../contentKeys'
import { formatDay, formatTimeOfDay } from '../format/date'
import { chipLabels, sportRecords } from '../records'
import { hrefFor } from '../route'
import { previousRoute } from '../routeHistory'
import { SPORT_LABEL } from '../sports'
import type { RouteReply } from '../routeReply'
import { useRouteShape } from '../useRouteShape'
import { PAGE_HEADING_ID } from './pageHeading'
import { RunSplits } from './RunSplits'
import './ActivityPage.css'

export interface ActivityPageProps {
  /** The activity the URL names, or null when the library does not hold it. The period never hides one. */
  activity: ActivitySummary | null
  result: AnalysisResult
  units: UnitSystem
  /** Body mass, kg, for the W/kg of cycling bests. */
  massKg: number
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
  /** Asks the worker for a run's splits; a run's splits are not kept in the page's result. */
  loadSplits: (id: string) => Promise<DigestSplits | null>
  /** The library id this activity is saved under, or null when it is not saved, as with the sample. */
  routeId: string | null
  /** Reads a saved activity's route. `fromOriginal` reads the kept original file. */
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>
  /** The period the bests are counted over. The record chips below are all-time, whatever it is. */
  period?: Period
}

const POWER_LABEL: Record<ActivitySummary['powerSource'], string> = {
  measured: 'Power meter',
  virtual: 'Estimated on climbs',
  none: 'None',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="activity-page__stat">
      <dt className="eyebrow">{label}</dt>
      <dd className="stat-number">{value}</dd>
    </div>
  )
}

/**
 * Back to the list. When the list is the page before this one, Back returns to it where it was left,
 * rather than opening it again as a new page.
 */
function backToList(event: MouseEvent<HTMLAnchorElement>) {
  // A modified or non-primary click is the browser's to open in a tab, as a link is.
  const modified =
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  if (modified || previousRoute()?.page !== 'activities') return
  event.preventDefault()
  window.history.back()
}

/** One activity: its summary, its route, the library bests it set, and any data issues in its file. */
export function ActivityPage({
  activity,
  result,
  units,
  massKg,
  records,
  loadSplits,
  routeId,
  loadRoute,
  period,
}: ActivityPageProps) {
  const { view: route, show } = useRouteShape(routeId, loadRoute)
  if (!activity) {
    return (
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Activity not found
        </h1>
        <p className="secondary">It may have been deleted, or it is not in this library.</p>
        <p>
          <a href={hrefFor({ page: 'activities' })} onClick={backToList}>
            Back to activities
          </a>
        </p>
      </div>
    )
  }

  const isRun = activity.sport === 'run'
  // The library's best efforts that this activity set, in the sport's own units.
  const bests = sportRecords(result, activity.sport, massKg, units).filter(
    (record) => record.activity?.id === activity.id,
  )
  const chips = chipLabels(records.get(activity.id) ?? [])
  return (
    <div className="page-stack">
      <div className="page-title">
        <a
          className="activity-page__back"
          href={hrefFor({ page: 'activities' })}
          onClick={backToList}
        >
          Back to activities
        </a>
        <p className="eyebrow activity-page__eyebrow">
          <SportIcon sport={activity.sport} className={`activity-page__icon--${activity.sport}`} />
          <span>{SPORT_LABEL[activity.sport]}</span>
          <span>{formatDay(activity.startMs)}</span>
          <span>{formatTimeOfDay(activity.startMs)}</span>
        </p>
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="activity-page__title">
          {activity.name}
        </h1>
      </div>

      <RouteOutline
        shape={route.kind === 'shape' ? route.route : null}
        sport={activity.sport}
        takeFocus={route.kind === 'shape' && route.fromRequest}
      />
      {route.kind === 'offer' && <RouteOffer status={route.status} onShow={show} />}

      <dl className="activity-page__stats">
        <Stat label="Time" value={formatDuration(activity.durationS)} />
        <Stat label="Distance" value={formatDistance(activity.distanceM, units)} />
        {activity.elevationGainM > 0 && (
          <Stat label="Climb" value={formatElevation(activity.elevationGainM, units)} />
        )}
        {isRun ? (
          <Stat
            label="Avg pace"
            value={formatPace(activity.distanceM / activity.durationS, units)}
          />
        ) : (
          <Stat
            label="Avg speed"
            value={formatSpeed(activity.distanceM / activity.durationS, units)}
          />
        )}
        <Stat label="Heart rate" value={activity.hasHeartRate ? 'Recorded' : 'Not recorded'} />
        {!isRun && <Stat label="Power" value={POWER_LABEL[activity.powerSource]} />}
      </dl>

      {chips.length > 0 && (
        <div className="activity-page__records" role="group" aria-labelledby="activity-records">
          <p id="activity-records" className="eyebrow">
            All-time records
          </p>
          <div className="activity-page__chips">
            {chips.map((label) => (
              <span key={label} className={`chip chip--${activity.sport}`}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
      {isRun && (
        <RunSplits
          activityId={activity.id}
          units={units}
          distanceM={activity.distanceM}
          loadSplits={loadSplits}
        />
      )}

      <section className="section" aria-labelledby="activity-bests">
        <h2 id="activity-bests">Best efforts set here</h2>
        {bests.length === 0 ? (
          <p className="secondary">
            {`None of your best efforts ${betweenClause(period) || 'in this period'} came from this activity.`}
          </p>
        ) : (
          <dl className="activity-page__stats">
            {bests.map((best) => (
              <Stat
                key={best.durationS}
                label={`Best ${formatDuration(best.durationS)}`}
                value={isRun ? `${best.value} grade-adjusted` : best.value}
              />
            ))}
          </dl>
        )}
      </section>

      {activity.flags.length > 0 && (
        <section className="section" aria-labelledby="activity-issues">
          <h2 id="activity-issues">Data issues</h2>
          <ul className="activity-page__flags">
            {keyByContent(activity.flags, (flag) => `${flag.kind}:${flag.start}-${flag.end}`).map(
              ({ key, item: flag }) => (
                <li key={key}>
                  {`${flag.message} (${formatDuration(flag.start)} to ${formatDuration(flag.end)})`}
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
