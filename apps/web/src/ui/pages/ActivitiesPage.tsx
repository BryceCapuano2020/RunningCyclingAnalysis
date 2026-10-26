import { useMemo, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { EarnedRecord } from '@rca/core/records'
import { startedWithin, windowEnding } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { ActivityList } from '../components/ActivityList'
import { plural } from '../components/plural'
import { LIBRARY_RANGE_OPTIONS } from '../components/rangeOptions'
import { listEmptyText } from '../periodCopy'
import { RangePicker } from '../components/RangePicker'
import { SegmentedControl } from '../components/SegmentedControl'
import type { SegmentedControlOption } from '../components/SegmentedControl'
import { countSport } from '../records'
import { PAGE_HEADING_ID } from './pageHeading'
import './ActivitiesPage.css'

export interface ActivitiesPageProps {
  /** Every activity in the library, newest first. The page narrows it; it never drops one. */
  activities: ActivitySummary[]
  units: UnitSystem
  /** The records each activity holds across the library, keyed by activity id. */
  records: ReadonlyMap<string, readonly EarnedRecord[]>
}

type SportFilter = 'all' | 'run' | 'ride'

const SPORT_OPTIONS: SegmentedControlOption<SportFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'run', label: 'Runs' },
  { value: 'ride', label: 'Rides' },
]

/**
 * Every activity in the library, newest first, counted by sport. The page has its own period and
 * sport filters, which start with the whole library and only narrow what is listed.
 */
export function ActivitiesPage({ activities, units, records }: ActivitiesPageProps) {
  const [choice, setChoice] = useState<PeriodChoice>('all')
  const [sport, setSport] = useState<SportFilter>('all')
  const days = typeof choice === 'number' ? choice : null
  // Memoised, so a re-render with the same activities keeps the pager on the page it is on.
  const shown = useMemo(
    () =>
      startedWithin(activities, days).filter(
        (activity) => sport === 'all' || activity.sport === sport,
      ),
    [activities, days, sport],
  )
  const newestMs = activities.reduce(
    (high, activity) => Math.max(high, activity.startMs),
    -Infinity,
  )
  const runs = countSport(activities, 'run')
  const rides = countSport(activities, 'ride')
  const showAll = () => {
    setChoice('all')
    setSport('all')
  }
  return (
    <div className="page-stack">
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Activities
        </h1>
        <p className="secondary">
          {activities.length === 0
            ? 'No activities yet'
            : `${plural(activities.length, 'activity', 'activities')}: ${plural(runs, 'run')}, ${plural(rides, 'ride')}`}
        </p>
      </div>
      {activities.length > 0 && (
        <div className="activities__controls">
          <RangePicker
            choice={choice}
            options={LIBRARY_RANGE_OPTIONS}
            shown={shown.length}
            total={activities.length}
            onChange={(next, answered) => {
              setChoice(next)
              answered(null)
            }}
          />
          <SegmentedControl
            legend="Sport"
            options={SPORT_OPTIONS}
            selected={sport}
            onSelect={setSport}
          />
        </div>
      )}
      {shown.length > 0 ? (
        <ActivityList activities={shown} units={units} records={records} />
      ) : (
        activities.length > 0 && (
          <div className="activities__empty">
            <p className="secondary">
              {listEmptyText(sport, days === null ? null : windowEnding(newestMs, days))}
            </p>
            <p>
              <button type="button" className="btn" onClick={showAll}>
                Show all activities
              </button>
            </p>
          </div>
        )
      )}
    </div>
  )
}
