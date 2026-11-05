import type { ActivitySummary } from '@rca/core/pipeline'
import { formatDayMonth } from '../format/date'
import { agoText } from '../format/ago'
import { hrefFor } from '../route'
import type { RecordRow } from '../recordRow'
import { NumText } from './NumText'
import { RecordTag } from './RecordTag'
import { RowIndex } from './RowList'
import { Sparkline } from './Sparkline'
import { sparkTrend, sparksDrawn } from './sparkRule'
import type { SparkPoint } from './Sparkline'
import './SportRecords.css'

export interface SportRecordsProps {
  rows: RecordRow[]
  /** A row's trend, by its key, from a series the page already charts: drawn as a sparkline at the row's right. */
  sparks?: Readonly<Record<string, readonly SparkPoint[]>>
}

/** The day an activity was set on, as the end of a link's text: ", 5 Jan". */
function dateText(activity: ActivitySummary): string {
  return `, ${formatDayMonth(activity.startMs)}`
}

/** The activity's name and the day it was set, as a link's whole text: "Morning run, 5 Jan". */
function sourceText(activity: ActivitySummary): string {
  return `${activity.name}${dateText(activity)}`
}

/**
 * A link's content. The name and the date are separate, so a narrow line cuts the name short with its
 * ellipsis and the date, which is what tells two records apart, is always whole.
 */
function SourceLabel({ activity }: { activity: ActivitySummary }) {
  return (
    <>
      <span className="records__name">{activity.name}</span>
      <span className="records__date">
        <NumText text={dateText(activity)} />
      </span>
    </>
  )
}

/**
 * The dot between an activity and how long ago it was set. It ends the activity's part, so when the count
 * wraps to its own line the dot stays behind with the name and no line starts with it.
 */
function Dot() {
  return (
    <>
      {' '}
      <span className="records__dot" aria-hidden="true">
        ·
      </span>
    </>
  )
}

/** How long ago a record was set, after the dot: "5 months ago". */
function AgoCount({ days }: { days: number }) {
  return (
    <>
      {' '}
      <span className="records__set">
        <NumText text={agoText(days)} />
      </span>
    </>
  )
}

/** The one activity every row was set in, when there are several rows and they all share it. */
function sharedActivity(rows: RecordRow[]): ActivitySummary | null {
  const first = rows[0]?.activity ?? null
  if (rows.length < 2 || first === null) return null
  return rows.every((row) => row.activity?.id === first.id) ? first : null
}

/** A figure as its number and its unit, so the unit can be set smaller: "5:31 /mi" is "5:31" and "/mi". */
function figureParts(value: string): { number: string; unit: string | null } {
  const at = value.indexOf(' ')
  return at < 0
    ? { number: value, unit: null }
    : { number: value.slice(0, at), unit: value.slice(at + 1) }
}

/** No row has a trend: the activity page's records, and a page that charts none. */
const NO_SPARKS: Readonly<Record<string, readonly SparkPoint[]>> = {}

/**
 * A sport's best efforts as numbered rows: the duration as the title, the figure in mono at its right, and one meta line
 * under the title: the day it was set, the activity as a link and its level and grade (docs/design/system.md, No
 * subtitle lines). How it moved is the row's sparkline, drawn only when every row has one, and words for a screen reader. When every record was set in one
 * activity, that activity is named once under the list rather than repeated on each row.
 */
export function SportRecords({ rows, sparks = NO_SPARKS }: SportRecordsProps) {
  const shared = sharedActivity(rows)
  // Sparklines are drawn for the whole list or for none of it.
  const drawn = sparksDrawn(rows.map((row) => sparks[row.key]))
  const sharedDays = shared === null ? null : (rows[0]?.setDays ?? null)
  return (
    <>
      <ol className="rows records">
        {rows.map((row, index) => {
          const figure = figureParts(row.value)
          return (
            <li key={row.key} className="row row--figures records__row">
              <RowIndex index={index} />
              <div className="row__body">
                <h3 className="row__title records__label">{row.label}</h3>
                {/* One meta line: the day it was set, the activity that set it and its grade. How it moved is the
                    sparkline's to show, and said in words to a screen reader. */}
                {!row.grade &&
                row.tags.length === 0 &&
                (shared !== null || !row.activity) ? null : (
                  <div className="meta records__meta">
                    {shared === null && row.activity && (
                      <>
                        <span className="records__date">
                          {formatDayMonth(row.activity.startMs)}
                        </span>
                        <a
                          className="records__link"
                          href={hrefFor({ page: 'activity', id: row.activity.id })}
                          title={sourceText(row.activity)}
                          aria-label={`${row.label}, from ${sourceText(row.activity)}`}
                        >
                          <span className="records__name">{row.activity.name}</span>
                        </a>
                      </>
                    )}
                    {row.grade && <span className="records__grade">{row.grade}</span>}
                    {row.tags.map((tag) => (
                      <RecordTag key={tag} tag={tag} />
                    ))}
                  </div>
                )}
                {row.change && (
                  <p className="sr-only records__change">
                    <NumText text={row.change} />
                  </p>
                )}
              </div>
              {/* The figure, its second reading and the trend each have a column of their own, so they line up down the list. */}
              <p className="row__figure records__figure">
                <span className="records__value">
                  {figure.number}
                  {/* A figure with no unit keeps the unit's slot, so its number ends where the others do. */}
                  {'\u00a0'}
                  <span className="row__unit">{figure.unit}</span>
                </span>
              </p>
              {row.sub && <span className="row__sub records__sub">{row.sub}</span>}
              <span className="row__spark">
                {drawn && <Sparkline points={sparks[row.key] ?? []} />}
                {drawn && !row.change && (
                  <span className="sr-only">{`Trend ${sparkTrend(sparks[row.key] ?? [])}`}</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      {shared && (
        <p className="records__shared">
          <span>All set on</span>{' '}
          <span className="records__source">
            <span className="records__where">
              <a
                className="records__link"
                href={hrefFor({ page: 'activity', id: shared.id })}
                title={sourceText(shared)}
              >
                <SourceLabel activity={shared} />
              </a>
              {sharedDays !== null && <Dot />}
            </span>
            {sharedDays !== null && <AgoCount days={sharedDays} />}
          </span>
        </p>
      )}
    </>
  )
}
