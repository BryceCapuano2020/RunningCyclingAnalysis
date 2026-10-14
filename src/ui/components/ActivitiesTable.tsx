import { Fragment, useId, useState } from 'react'
import type { ActivitySummary } from '../../core/pipeline'
import type { UnitSystem } from '../../core/units'
import { formatDistance, formatDuration, formatElevation } from '../../core/units'
import { plural } from './plural'
import './ActivitiesTable.css'

export interface ActivitiesTableProps {
  activities: ActivitySummary[]
  units: UnitSystem
}

const PREVIEW_ROWS = 20
const COLUMN_COUNT = 9

const POWER_LABEL: Record<ActivitySummary['powerSource'], string> = {
  measured: 'Measured',
  virtual: 'Estimated on climbs',
  none: '—',
}

function utcDate(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

export function ActivitiesTable({ activities, units }: ActivitiesTableProps) {
  const baseId = useId()
  const [openIssues, setOpenIssues] = useState<ReadonlySet<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)

  if (activities.length === 0) {
    return <p className="muted">No activities yet</p>
  }

  const visible = showAll ? activities : activities.slice(0, PREVIEW_ROWS)

  function toggleIssues(id: string) {
    setOpenIssues((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="activities-table">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Activity</th>
              <th scope="col">Sport</th>
              <th scope="col" className="num">
                Time
              </th>
              <th scope="col" className="num">
                Distance
              </th>
              <th scope="col" className="num">
                Climb
              </th>
              <th scope="col">Power</th>
              <th scope="col">Heart rate</th>
              <th scope="col">Data issues</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((activity, index) => {
              const panelId = `${baseId}-issues-${index}`
              const open = openIssues.has(activity.id)
              const issueCount = activity.flags.length
              return (
                <Fragment key={activity.id}>
                  <tr>
                    <td>{utcDate(activity.startMs)}</td>
                    <td>{activity.name}</td>
                    <td>
                      <span className={`swatch swatch-${activity.sport}`} aria-hidden="true" />
                      {activity.sport === 'run' ? 'Run' : 'Ride'}
                    </td>
                    <td className="num">{formatDuration(activity.durationS)}</td>
                    <td className="num">{formatDistance(activity.distanceM, units)}</td>
                    <td className="num">{formatElevation(activity.elevationGainM, units)}</td>
                    <td>{POWER_LABEL[activity.powerSource]}</td>
                    <td>{activity.hasHeartRate ? 'Yes' : 'No'}</td>
                    <td>
                      {issueCount === 0 ? (
                        'None'
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          aria-expanded={open}
                          aria-controls={open ? panelId : undefined}
                          onClick={() => toggleIssues(activity.id)}
                        >
                          {plural(issueCount, 'issue')}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr id={panelId}>
                      <td colSpan={COLUMN_COUNT} className="activities-table__issues">
                        <ul className="activities-table__flags">
                          {activity.flags.map((flag, flagIndex) => (
                            <li key={flagIndex}>
                              {`${flag.message} (${formatDuration(flag.start)} to ${formatDuration(flag.end)})`}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {!showAll && activities.length > PREVIEW_ROWS && (
        <button type="button" className="btn" onClick={() => setShowAll(true)}>
          {`Show all ${activities.length}`}
        </button>
      )}
    </div>
  )
}
