import { useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { TrendChart } from '../charts'
import { windowCompound } from '../charts/trendText'
import { SegmentedControl } from '../components/SegmentedControl'
import { EFFORT_OPTIONS, effortOf } from '../records'

export interface WeekByWeekSectionProps {
  sport: Sport
  /** The weekly trend of each effort length over the period. */
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** The trailing window of each trend point, in days. */
  windowDays: number
  massKg: number
  units: UnitSystem
}

/**
 * A sport's best effort of one length in each week. Each point is the best in a trailing window, so a
 * dip can be an old best leaving the window and not a change in the athlete, which the line under
 * the chart says.
 */
export function WeekByWeekSection({
  sport,
  trends,
  windowDays,
  massKg,
  units,
}: WeekByWeekSectionProps) {
  const [effort, setEffort] = useState<EffortLengthS>(HEADLINE_DURATION_S)
  return (
    <section className="section" aria-labelledby={`${sport}-trend`}>
      <h2 id={`${sport}-trend`}>Week by week</h2>
      <SegmentedControl
        legend="Effort length"
        options={EFFORT_OPTIONS}
        selected={String(effort)}
        onSelect={(value) => {
          const next = effortOf(value)
          if (next !== undefined) setEffort(next)
        }}
      />
      <TrendChart
        sport={sport}
        points={trends[effort]}
        massKg={massKg}
        units={units}
        windowDays={windowDays}
        effortS={effort}
      />
      <p className="muted">
        {`A dip can be a best leaving the ${windowCompound(windowDays)} window, not a change in you.`}
      </p>
    </section>
  )
}
