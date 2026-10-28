import type { LateEvidence } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { DriftChart, DurabilityChart } from '../charts'
import { LATE_IN_EFFORT_NAME, lateInEffort } from '../lateInEffort'
import { activityNames } from '../records'
import type { ActivitySummary } from '@rca/core/pipeline'

/**
 * How a sport's output holds up late in long sessions: the best efforts that start after an hour or more
 * of moving time against the fresh best, and how output per heartbeat changed across steady efforts. A half
 * with too little behind it is left out and named in the page's "Not enough yet" list; with neither,
 * the section has no heading.
 */
export function LateInEffortSection({
  sport,
  evidence,
  activities,
  units,
}: {
  sport: Sport
  evidence: LateEvidence
  activities: ActivitySummary[]
  units: UnitSystem
}) {
  const { durability, drift } = lateInEffort(sport, evidence)
  if (durability === null && drift === null) return null
  return (
    <section className="section" aria-labelledby={`${sport}-late-in-effort`}>
      <h2 id={`${sport}-late-in-effort`}>{LATE_IN_EFFORT_NAME}</h2>
      {durability !== null && (
        <>
          <p className="secondary">{durability.lede}</p>
          <DurabilityChart
            sport={sport}
            groups={durability.groups}
            units={units}
            note={durability.note}
          />
        </>
      )}
      {drift !== null && (
        <>
          <p className="secondary">{drift.lede}</p>
          <DriftChart
            sport={sport}
            points={drift.points}
            names={activityNames(activities)}
            note={drift.note}
          />
        </>
      )}
    </section>
  )
}
