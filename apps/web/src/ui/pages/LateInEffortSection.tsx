import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { DriftChart, DurabilityChart } from '../charts'
import type { LateInEffort } from '../lateInEffort'
import { activityNames } from '../records'
import type { ActivitySummary } from '@rca/core/pipeline'

/**
 * How a sport's output holds up late in long sessions, as two charts each titled by what it found: the best
 * efforts that start after an hour or more of moving time against the best overall, as a stat and a dumbbell,
 * and how output per heartbeat changed across steady efforts, as a dot for each with the median drawn across.
 * A half with too little behind it is left out and named in the page's "Not enough yet" list; with neither,
 * the section has no content.
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
  const { durability, drift } = reading
  return (
    <>
      {durability !== null && (
        <DurabilityChart
          sport={sport}
          groups={durability.groups}
          units={units}
          takeaway={durability.stat}
          note={`${durability.lede} ${durability.note}`}
        />
      )}
      {drift !== null && (
        <DriftChart
          sport={sport}
          points={drift.points}
          names={activityNames(activities)}
          takeaway={drift.lede}
          medianPct={drift.medianPct}
          note={drift.note}
        />
      )}
    </>
  )
}
