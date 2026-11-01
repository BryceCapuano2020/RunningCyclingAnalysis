import { useState } from 'react'
import type { IntensityRow } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { IntensityByYearChart } from '../../charts/IntensityByYearChart'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SPORT_LABEL, SPORT_ORDER } from '../../sports'

export interface IntensityByYearSectionProps {
  years: readonly IntensityRow[]
}

/**
 * The intensity chart with a sport toggle when both sports have heart-rate time. It opens on the first sport in
 * SPORT_ORDER that has some, so a library with one sport has no toggle.
 */
export function IntensityByYearSection({ years }: IntensityByYearSectionProps) {
  const withTime = SPORT_ORDER.filter((sport) => years.some((row) => row.sports[sport].seconds > 0))
  const [picked, setPicked] = useState<Sport | null>(null)
  const sport: Sport = picked ?? withTime[0] ?? SPORT_ORDER[0]
  return (
    <>
      {withTime.length > 1 ? (
        <SegmentedControl
          legend="Sport"
          legendHidden
          options={withTime.map((value) => ({ value, label: SPORT_LABEL[value] }))}
          selected={sport}
          onSelect={setPicked}
        />
      ) : null}
      <IntensityByYearChart years={years} sport={sport} />
    </>
  )
}
