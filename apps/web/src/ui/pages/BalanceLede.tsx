import { wholeCentre } from '../../domain/lean'
import type { BalanceReading } from '../components/balanceScale'
import { energySummary, readFrom } from '../components/headlineText'
import { plural } from '../components/plural'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_TITLE } from '../sports'

/** The headline length with a no-break space, so "20 min" never parts across a line. */
const OVER = `over ${HEADLINE_LABEL.replace(' ', ' ')}`

/**
 * The answer in one plain sentence under the headline: who grades higher, by how many points, over which effort.
 * The range is written under the meter's dot, where it is read against the line, so the sentence does not say it
 * twice. An energy balance, which has no grades, keeps its one sentence.
 */
export function BalanceLede({
  reading,
  durationS,
}: {
  reading: BalanceReading
  durationS: number
}) {
  if (reading.unit === 'percent') return <>{energySummary(reading, durationS)}</>
  const centre = wholeCentre(reading.lead)
  if (centre === 0) return <>Running and cycling grade the same {OVER}.</>
  return (
    <>
      {SPORT_TITLE[readFrom(reading)]} grades {plural(Math.abs(centre), 'point')} higher {OVER}.
    </>
  )
}
