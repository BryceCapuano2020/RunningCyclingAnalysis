import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { DriftChart, DurabilityChart } from '../charts'
import type { LateInEffort } from '../lateInEffort'
import { activityNames } from '../records'
import type { ActivitySummary } from '@rca/core/pipeline'

/**
 * How a sport's output holds up in long sessions, as two charts each titled by what it found: the best
 * efforts that start after an hour or more of moving time against the best overall, as a stat and a dumbbell,
 * and how efficiency changed across steady efforts, as a dot for each with the median drawn across.
 * A half with too little behind it is left out and says what it needs in a line under the other; the page
 * gives the section as one line when neither half has anything to show.
 */
export function LateInEffortSection({
  sport,
  reading,
  activities,
  units,
}: {
  sport: Sport
  reading: LateInEffort
  activities: ActivitySummary[]
  units: UnitSystem
}) {
  const { durability, drift, needs } = reading
  return (
    <>
      {durability !== null && (
        <DurabilityChart
          sport={sport}
          groups={durability.groups}
          units={units}
          takeaway={durability.stat}
        />
      )}
      {drift !== null && (
        <DriftChart
          sport={sport}
          points={drift.points}
          names={activityNames(activities)}
          takeaway={drift.lede}
          medianPct={drift.medianPct}
        />
      )}
      {needs.map((need) => (
        <p key={need} className="muted">
          {need}
        </p>
      ))}
    </>
  )
}
