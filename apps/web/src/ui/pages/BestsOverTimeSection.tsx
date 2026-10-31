import { useMemo, useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { NONE_WITHHELD } from '@rca/core/digest/trendPoints'
import type { DotsWithheld, EffortLengthS } from '@rca/core/digest/trendPoints'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { BestsOverTimeChart } from '../charts/BestsOverTimeChart'
import { SegmentedControl } from '../components/SegmentedControl'
import { namedChangeAt } from '../charts/sportCurveTakeaway'
import type { TakeawayInput } from '../charts/sportCurveTakeaway'
import { EFFORT_OPTIONS, effortOf } from '../records'

export interface BestsOverTimeSectionProps {
  sport: Sport
  /** The weekly trend of each effort length over the period: the efforts that led its windows are the dots. */
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** The lengths whose dots the effort gate left too few to draw: such a length's empty state names the gate. Absent: none. */
  withheld?: DotsWithheld
  massKg: number
  units: UnitSystem
  /** The curve rows and change test the finding about a length is read from; null where no period before can be compared. */
  finding: TakeawayInput | null
}

/**
 * A sport's best efforts of one length as dated dots, with the change test's finding about that length
 * against the period before as the title. There is no line: a line through window bests measured how often the
 * athlete went hard, and the fitness status above is the sport's trend.
 */
export function BestsOverTimeSection({
  sport,
  trends,
  withheld = NONE_WITHHELD,
  massKg,
  units,
  finding,
}: BestsOverTimeSectionProps) {
  const [effort, setEffort] = useState<EffortLengthS>(HEADLINE_DURATION_S)
  const takeaway = useMemo(
    () => (finding === null ? null : namedChangeAt(finding, effort)),
    [finding, effort],
  )
  return (
    <section className="section" aria-labelledby={`${sport}-over-time`}>
      <h2 id={`${sport}-over-time`}>Best efforts over time</h2>
      <SegmentedControl
        legend="Effort length"
        options={EFFORT_OPTIONS}
        selected={String(effort)}
        onSelect={(value) => {
          const next = effortOf(value)
          if (next !== undefined) setEffort(next)
        }}
      />
      <BestsOverTimeChart
        sport={sport}
        points={trends[effort]}
        gateWithheld={withheld[sport][effort]}
        massKg={massKg}
        units={units}
        effortS={effort}
        takeaway={takeaway}
        comparedWith={takeaway === null || finding === null ? null : finding.previousLabel}
      />
    </section>
  )
}
