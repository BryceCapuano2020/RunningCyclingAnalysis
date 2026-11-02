import { RecordTag } from '../components/RecordTag'
import type { RecordRow } from '../recordRow'
import { formatDayMonth } from '../format/date'
import { hrefFor } from '../route'
import { sharedTileActivity } from './tileRows'
import './RecordTiles.css'

/** The activity as a link: its name cut short by the layout, and its date, which tells two apart, always whole. */
function SourceLink({
  row,
}: {
  row: RecordRow & { activity: NonNullable<RecordRow['activity']> }
}) {
  const { activity } = row
  const date = formatDayMonth(activity.startMs)
  return (
    <a
      className="record-tiles__link"
      href={hrefFor({ page: 'activity', id: activity.id })}
      title={`${activity.name}, ${date}`}
      aria-label={`${row.label}, from ${activity.name}, ${date}`}
    >
      <span className="record-tiles__name">{activity.name}</span>
      <span className="record-tiles__date">{`, ${date}`}</span>
    </a>
  )
}

/**
 * A strip of a few records under the curve: each is the time or power at display size, the pace or W/kg
 * beside it, its level as a chip, and the activity that set it as a link. When every record was set in one
 * activity, that activity is named once under the strip and not on each tile.
 */
export function RecordTiles({ tiles }: { tiles: readonly RecordRow[] }) {
  if (tiles.length === 0) return null
  const shared = sharedTileActivity(tiles)
  return (
    <>
      <ul className="record-tiles" aria-label="Best efforts">
        {tiles.map((row) => (
          <li key={row.key} className="record-tiles__tile">
            <span className="record-tiles__label">{row.label}</span>
            <span className="record-tiles__value">{row.value}</span>
            {row.sub && <span className="record-tiles__sub">{row.sub}</span>}
            {row.tags.length > 0 && (
              <span className="record-tiles__tags">
                {row.tags.map((tag) => (
                  <RecordTag key={tag} tag={tag} />
                ))}
              </span>
            )}
            {row.grade && <span className="record-tiles__grade">{row.grade}</span>}
            {row.change && <span className="record-tiles__change">{row.change}</span>}
            {shared === null && row.activity && (
              <SourceLink row={{ ...row, activity: row.activity }} />
            )}
          </li>
        ))}
      </ul>
      {shared && (
        <p className="muted record-tiles__shared">
          All set on{' '}
          <a href={hrefFor({ page: 'activity', id: shared.id })}>
            {`${shared.name}, ${formatDayMonth(shared.startMs)}`}
          </a>
        </p>
      )}
    </>
  )
}
