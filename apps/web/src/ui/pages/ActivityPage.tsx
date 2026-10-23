import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
} from '@rca/core/units'
import { SportIcon } from '../components/icons'
import { keyByContent } from '../contentKeys'
import { formatDay, formatTimeOfDay } from '../format/date'
import { sportRecords } from '../records'
import { hrefFor } from '../route'
import { SPORT_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import './ActivityPage.css'

export interface ActivityPageProps {
  /** The activity the URL names, or null when it is not in the selected period. */
  activity: ActivitySummary | null
  result: AnalysisResult
  units: UnitSystem
  /** Body mass, kg, for the W/kg of cycling bests. */
  massKg: number
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

/** One activity: its summary, the library bests it set, and any data issues in its file. */
export function ActivityPage({ activity, result, units, massKg }: ActivityPageProps) {
  if (!activity) {
    return (
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Activity not found
        </h1>
        <p className="secondary">It may be outside the period you selected.</p>
        <p>
          <a href={hrefFor({ page: 'activities' })}>Back to activities</a>
        </p>
      </div>
    )
  }

  const isRun = activity.sport === 'run'
  // The library's best efforts that this activity set, in the sport's own units.
  const bests = sportRecords(result, activity.sport, massKg, units).filter(
    (record) => record.activity?.id === activity.id,
  )
  return (
    <div className="page-stack">
      <div className="page-title">
        <a className="activity-page__back" href={hrefFor({ page: 'activities' })}>
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

      <section className="section" aria-labelledby="activity-bests">
        <h2 id="activity-bests">Best efforts set here</h2>
        {bests.length === 0 ? (
          <p className="secondary">
            None of your best efforts in this period come from this activity.
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
