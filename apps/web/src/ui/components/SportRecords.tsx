import type { ActivitySummary } from '@rca/core/pipeline'
import { formatDayMonth } from '../format/date'
import { hrefFor } from '../route'
import type { RecordRow } from '../recordRow'
import './SportRecords.css'

export interface SportRecordsProps {
  rows: RecordRow[]
}

/** The activity's name and the day it was set, as a link's text: "Morning run, 5 Jan". */
function sourceText(activity: ActivitySummary): string {
  return `${activity.name}, ${formatDayMonth(activity.startMs)}`
}

/** The one activity every row was set in, when there are several rows and they all share it. */
function sharedActivity(rows: RecordRow[]): ActivitySummary | null {
  const first = rows[0]?.activity ?? null
  if (rows.length < 2 || first === null) return null
  return rows.every((row) => row.activity?.id === first.id) ? first : null
}

/**
 * A sport's best efforts, one row each: the duration, the figure, its second reading, its grade and
 * the activity that set it. When every record was set in one activity, that activity is named once
 * under the list rather than repeated on each row. A long name is cut short by the layout, with its
 * whole text as the link's title.
 */
export function SportRecords({ rows }: SportRecordsProps) {
  const shared = sharedActivity(rows)
  return (
    <>
      <ul className="records">
        {rows.map((row) => (
          <li key={row.key} className="records__row">
            <span className="records__label">{row.label}</span>
            <span className="records__figure">
              <span className="records__value">{row.value}</span>
              {row.sub && <span className="records__sub">{row.sub}</span>}
              {row.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </span>
            {row.grade && <span className="records__grade">{row.grade}</span>}
            {row.change && <span className="records__change">{row.change}</span>}
            {shared === null && row.activity && (
              <a
                className="records__link"
                href={hrefFor({ page: 'activity', id: row.activity.id })}
                title={sourceText(row.activity)}
                aria-label={`${row.label}, from ${sourceText(row.activity)}`}
              >
                {sourceText(row.activity)}
              </a>
            )}
          </li>
        ))}
      </ul>
      {shared && (
        <p className="records__shared">
          <span>All set on</span>{' '}
          <a
            className="records__link"
            href={hrefFor({ page: 'activity', id: shared.id })}
            title={sourceText(shared)}
          >
            {sourceText(shared)}
          </a>
        </p>
      )}
    </>
  )
}
