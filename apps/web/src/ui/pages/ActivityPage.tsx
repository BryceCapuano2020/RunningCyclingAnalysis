import { useEffect } from 'react'
import type { MouseEvent } from 'react'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { ActivityTraceReply } from '../../worker/protocol'
import type { EarnedRecord } from '@rca/core/records'
import type { Period } from '@rca/core/period'
import type { DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { ActivityDelete } from '../components/ActivityDelete'
import { RouteOffer } from '../components/RouteOffer'
import { RouteShape as RouteOutline } from '../components/RouteShape'
import { SplitsTable } from '../components/SplitsTable'
import { SportIcon } from '../components/icons'
import { formatDay, formatTimeOfDay } from '../format/date'
import type { AgeProfile } from '../grades'
import { chipLabels } from '../records'
import { hrefFor } from '../route'
import { removedHash } from '../activitiesView'
import { previousRoute } from '../routeHistory'
import { SPORT_LABEL } from '../sports'
import type { RouteReply } from '../routeReply'
import { useDeleteOutcome } from '../useDeleteOutcome'
import { useRouteShape } from '../useRouteShape'
import { useRunSplits } from '../useRunSplits'
import { ActivityBests } from './ActivityBests'
import { ActivityIssues } from './ActivityIssues'
import { ActivityNav } from './ActivityNav'
import { ActivityStats } from './ActivityStats'
import { ActivityWorkbench } from './ActivityWorkbench'
import { PAGE_HEADING_ID } from './pageHeading'
import './ActivityPage.css'

export interface ActivityPageProps {
  /** The activity the URL names, or null when the library does not hold it. The period never hides one. */
  activity: ActivitySummary | null
  /** The whole library, newest first, so the activities either side of this one can be linked. */
  library: ActivitySummary[]
  result: AnalysisResult
  units: UnitSystem
  /** Body mass, kg, for the W/kg of cycling bests. Only used while weightKnown. */
  massKg: number
  /** False while no body weight is entered: a ride's figures wait for it. */
  weightKnown: boolean
  /** The age and sex the grades are worked out with; null before the athlete gives them. */
  profile: AgeProfile | null
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
  /** Asks the worker for a run's splits; a run's splits are not kept in the page's result. */
  loadSplits: (id: string) => Promise<DigestSplits | null>
  /** Reads a locally cached detail trace, or an original file only when explicitly requested. */
  loadTrace?: (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply>
  /** The library id this activity is saved under, or null when it is not saved, as with the sample. */
  routeId: string | null
  /** Reads a saved activity's route. `fromOriginal` reads the kept original file. */
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>
  /** The period the bests are counted over. The record chips below are all-time, whatever it is. */
  period?: Period
  /** A removal is already running, so Delete waits. */
  busy?: boolean
  /** Whether the visitor is signed in, which says where a removal takes the activity from. */
  signedIn: boolean
  /** Removes the activity's saved copy. Without it, or without a saved copy, there is no Delete. */
  onDelete?: (savedId: string) => void
  /** The library's notice and error, which say how a removal from this page ended. */
  libraryNotice?: string | null
  libraryError?: string | null
}

/** A modified or non-primary click is the browser's to open in a tab, as a link is. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}

/**
 * Back to the list. When the list is the page before this one, Back returns to it where it was left,
 * rather than opening it again as a new page.
 */
function backToList(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event) || previousRoute()?.page !== 'activities') return
  event.preventDefault()
  window.history.back()
}

/** The page the activity was opened from, when that is the list, Run or Ride; otherwise null. */
function originOf(): 'activities' | 'run' | 'ride' | null {
  const page = previousRoute()?.page
  return page === 'activities' || page === 'run' || page === 'ride' ? page : null
}

/** Back to where the activity was opened from, so Back and the link agree, as backToList does. */
function backToOrigin(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event) || originOf() === null) return
  event.preventDefault()
  window.history.back()
}

/**
 * One activity: its figures, its route, its best efforts and records, its splits, its skipped
 * readings, and the links that explain its numbers.
 */
export function ActivityPage({
  activity,
  library,
  result,
  units,
  massKg,
  weightKnown,
  profile,
  records,
  loadSplits,
  loadTrace,
  routeId,
  loadRoute,
  period,
  busy = false,
  signedIn,
  onDelete,
  libraryNotice = null,
  libraryError = null,
}: ActivityPageProps) {
  const { view: route, show } = useRouteShape(routeId, loadRoute)
  const removal = useDeleteOutcome(libraryNotice, libraryError)
  // Only a run's splits are asked for; the page keeps the answer, so the bests can place the flat pace note.
  const splitsLoad = useRunSplits(activity?.sport === 'run' ? activity.id : null, loadSplits)
  // Once the library has removed the activity, the list replaces this page in the history, so Back never
  // lands on an activity that is gone. A failed removal stays here, with its reason beside Delete.
  const removed = removal.outcome !== null && !removal.outcome.failed
  useEffect(() => {
    if (removed) window.location.replace(removedHash())
  }, [removed])
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
  // The period's result holds only the activities in it, so one outside it is not in the result.
  const inPeriod = result.activities.some((candidate) => candidate.id === activity.id)
  // A ride's record chips are the library's bests, which use the body mass, so they wait for the weight.
  const chips =
    activity.sport === 'ride' && !weightKnown ? [] : chipLabels(records.get(activity.id) ?? [])
  return (
    <div className="page-stack">
      <div className="page-title">
        <BackLink origin={originOf()} />
        <p className="eyebrow activity-page__eyebrow">
          <SportIcon sport={activity.sport} className="activity-page__icon" />
          <span>{SPORT_LABEL[activity.sport]}</span>
          <span>{formatDay(activity.startMs)}</span>
          <span>{formatTimeOfDay(activity.startMs)}</span>
          {activity.indoor && <span className="chip">Indoor</span>}
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

      <ActivityStats activity={activity} units={units} />
      {loadTrace && (
        <ActivityWorkbench activityId={activity.id} units={units} loadTrace={loadTrace} />
      )}
      {activity.powerSource === 'virtual' && (
        <p className="secondary">
          Power here is estimated from speed and climbs. No power meter recorded it.
        </p>
      )}
      <ActivityNav activity={activity} library={library} />

      {chips.length > 0 && (
        <div className="activity-page__records" role="group" aria-labelledby="activity-records">
          <p id="activity-records" className="eyebrow">
            All-time records
          </p>
          <div className="activity-page__chips">
            {chips.map((label) => (
              <a
                key={label}
                className="chip"
                data-sport={activity.sport}
                href={hrefFor({ page: activity.sport })}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      )}
      {isRun && <SplitsTable load={splitsLoad} units={units} distanceM={activity.distanceM} />}

      <ActivityBests
        activity={activity}
        result={result}
        units={units}
        massKg={massKg}
        weightKnown={weightKnown}
        profile={profile}
        inPeriod={inPeriod}
        period={period}
        splitsLoad={splitsLoad}
      />
      <ActivityIssues
        activity={activity}
        heartRateSetAside={result.heartRateSetAside.includes(activity.id)}
      />

      {routeId !== null && onDelete && (
        <div className="activity-page__remove">
          <ActivityDelete
            savedId={routeId}
            name={activity.name}
            busy={busy}
            signedIn={signedIn}
            onDelete={(savedId) => {
              removal.begin()
              onDelete(savedId)
            }}
          />
          {removal.outcome?.failed && (
            <p role="alert" className="activity-page__outcome">
              {removal.outcome.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The link back at the top of an activity: to the list, or to the Run or Ride page it was opened from. */
function BackLink({ origin }: { origin: 'activities' | 'run' | 'ride' | null }) {
  const label =
    origin === 'run' || origin === 'ride' ? `Back to ${SPORT_LABEL[origin]}` : 'Back to activities'
  return (
    <a
      className="activity-page__back"
      href={hrefFor({ page: origin ?? 'activities' })}
      onClick={backToOrigin}
    >
      {label}
    </a>
  )
}
