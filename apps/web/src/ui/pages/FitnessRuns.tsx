import { useMemo, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { FitnessSpan } from '@rca/core/fitness'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance } from '@rca/core/units'
import { formatDayMonth } from '../format/date'
import { plural } from '../components/plural'
import { hrefFor } from '../route'

/** The runs a list shows before it offers the rest. */
const SHOWN = 8

/**
 * The runs a level rests on, newest first, each a link to its page. A span of a hundred runs shows its newest
 * few and the button that opens the rest, so the panel stays short; a run no longer in the library is
 * counted and left out of the list.
 */
export function FitnessRuns({
  span,
  library,
  units,
  noun,
}: {
  span: FitnessSpan
  library: readonly ActivitySummary[]
  units: UnitSystem
  /** What one is called, "steady run". */
  noun: string
}) {
  const [all, setAll] = useState(false)
  const rows = useMemo(() => {
    const byId = new Map(library.map((activity) => [activity.id, activity]))
    return [...span.ids].reverse().flatMap((id) => {
      const activity = byId.get(id)
      return activity === undefined ? [] : [activity]
    })
  }, [span.ids, library])
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <>
      <ul className="fitness-runs">
        {shown.map((activity) => (
          <li key={activity.id} className="fitness-runs__row">
            <a href={hrefFor({ page: 'activity', id: activity.id })}>
              <span className="fitness-runs__date">{formatDayMonth(activity.startMs)}</span>
              <span className="fitness-runs__name">{activity.name}</span>
            </a>
            <span className="fitness-runs__figure muted">
              {formatDistance(activity.distanceM, units)}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN ? (
        <button type="button" className="btn" onClick={() => setAll((was) => !was)}>
          {all ? `Show the newest ${SHOWN}` : `Show all ${plural(rows.length, noun)}`}
        </button>
      ) : null}
    </>
  )
}
