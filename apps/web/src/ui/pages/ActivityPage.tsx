import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { ActivityTraceReply } from '../../worker/protocol'
import type { EarnedRecord } from '@rca/core/records'
import type { Period } from '@rca/core/period'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { AthleteSettings, DigestSplits } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { zonesAt } from '@rca/core/zones'
import type { ZoneSet } from '@rca/core/zones'
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
import { AWAITED, NO_DETAIL, useSplitsView, type TraceReport } from '../useSplitsView'
import { NEEDS_WEIGHT } from '../zoneRows'
import { ActivityBests } from './ActivityBests'
import { setAsideActivityText } from '../analysis/setAsideCopy'
import { WALKING_PACE_CHIP, WALKING_PACE_NOTE } from '../analysis/walkingPaceCopy'
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
  /** The settings the analysis runs on, dated ones included, which cut the activity's zones. Absent: no zones section. */
  settings?: AthleteSettings
  /**
   * Whose heart rate is set aside, judged once over the whole library, which holds an activity the period
   * does not, and what it was judged against.
   */
  heartRateJudgement: HeartRateJudgement
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
  /** The period the page's period bests are counted over. The record chips are all-time, whatever it is. */
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

/**
 * The zones in effect on the day of the activity, for its sport. A ride's estimated power zones wait
 * for the body weight, as on Profile, and a heart rate the analysis set aside is not read into zones.
 */
function zoneSetsOf(
  activity: ActivitySummary | null,
  settings: AthleteSettings,
  result: AnalysisResult,
  weightKnown: boolean,
  setAsideIds: readonly string[],
): ZoneSet[] {
  if (activity === null) return []
  const setAside = setAsideIds.includes(activity.id)
  return zonesAt(activity.startMs, settings, result).filter(
    (set) =>
      set.sport === activity.sport &&
      !(setAside && set.measure === 'heartRate') &&
      !(!weightKnown && set.source === 'estimated' && NEEDS_WEIGHT[set.measure]),
  )
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
  settings,
  heartRateJudgement,
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
  const setAsideIds = heartRateJudgement.setAside
  const zoneSets = useMemo(
    () =>
      settings === undefined
        ? undefined
        : zoneSetsOf(activity, settings, result, weightKnown, setAsideIds),
    [activity, settings, result, weightKnown, setAsideIds],
  )
  // Only a run's splits are asked for; the page keeps the answer, so the bests can place the flat pace note.
  const runId = activity?.sport === 'run' ? activity.id : null
  const splitsLoad = useRunSplits(runId, loadSplits)
  // The workbench reads the trace; the splits borrow its laps, so the device's own laps can be their view.
  // The report is the activity's own: this page is reused from one activity to the next, so a report
  // made for the last one says nothing of this one, and a page with no detail to read has nothing on its way.
  const activityId = activity?.id ?? null
  const [report, setReport] = useState<{ id: string | null } & TraceReport>({
    id: null,
    trace: null,
    settled: false,
  })
  const onTrace = useCallback(
    (trace: ActivityTrace | null, settled: boolean) =>
      setReport({ id: activityId, trace, settled }),
    [activityId],
  )
  const detail = loadTrace === undefined ? NO_DETAIL : report.id === activityId ? report : AWAITED
  const trace = detail.trace?.activityId === activityId ? detail.trace : null
  const splitsView = useSplitsView(runId, { trace, settled: detail.settled })
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
  const earned = activity.sport === 'ride' && !weightKnown ? [] : (records.get(activity.id) ?? [])
  const chips = chipLabels(earned)
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
          {activity.walkingPace && <span className="chip">{WALKING_PACE_CHIP}</span>}
        </p>
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className="activity-page__title">
          {activity.name}
        </h1>
      </div>

      {route.kind === 'offer' && <RouteOffer status={route.status} onShow={show} />}

      {/* With a route, the figures sit beside it on a wide screen, so the header has no blank half. */}
      <div
        className={
          route.kind === 'shape'
            ? 'activity-page__top activity-page__top--route'
            : 'activity-page__top'
        }
      >
        <RouteOutline
          shape={route.kind === 'shape' ? route.route : null}
          sport={activity.sport}
          takeFocus={route.kind === 'shape' && route.fromRequest}
        />
        <ActivityStats activity={activity} units={units} />
      </div>
      {loadTrace && (
        <ActivityWorkbench
          activityId={activity.id}
          units={units}
          indoor={activity.indoor}
          loadTrace={loadTrace}
          zoneSets={zoneSets}
          heartRateSetAside={setAsideIds.includes(activity.id)}
          onTrace={onTrace}
        />
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
      {isRun && (
        <SplitsTable
          load={splitsLoad}
          units={units}
          distanceM={activity.distanceM}
          trace={trace}
          view={splitsView.view}
          onViewChange={splitsView.choose}
        />
      )}

      {/* A run at walking pace is outside the analysis, so there are no bests to give. */}
      {activity.walkingPace ? (
        <p className="secondary">{WALKING_PACE_NOTE}</p>
      ) : (
        <ActivityBests
          activity={activity}
          result={result}
          units={units}
          massKg={massKg}
          weightKnown={weightKnown}
          profile={profile}
          inPeriod={inPeriod}
          period={period}
          earned={earned}
          splitsLoad={splitsLoad}
          splitsView={splitsView.view}
        />
      )}
      <ActivityIssues
        activity={activity}
        setAsideNote={
          setAsideIds.includes(activity.id)
            ? setAsideActivityText(activity.sport, heartRateJudgement)
            : null
        }
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
