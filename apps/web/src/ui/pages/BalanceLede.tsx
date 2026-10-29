import type { Sport } from '@rca/core/types'
import { wholeCentre } from '../../domain/lean'
import { Definition } from '../components/Definition'
import type { BalanceReading } from '../components/balanceScale'
import { balanceSummary, readFrom, rangeText } from '../components/headlineText'
import { plural } from '../components/plural'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_NOUN, SPORT_TITLE } from '../sports'
import { rangeVerdictText } from './balanceCopy'
import { DEFINITIONS } from './balanceDefinitions'

/** The sport that is not this one. */
const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

/** The leading sport's word as the sentence's subject, and the other's as its possessive: "Running’s", "cycling’s". */
function subjects(reading: BalanceReading) {
  const lead = readFrom(reading)
  const other = OTHER_SPORT[lead]
  return { lead: `${SPORT_TITLE[lead]}’s`, other: `${SPORT_NOUN[other]}’s` }
}

/**
 * The answer in two plain sentences under the headline. The first states the gap and the effort it is taken
 * at, with "age grade" defined in place; the second gives the 90% range, defined too, and says whether the lead
 * holds across it. An energy balance, which has no grades, keeps its one sentence.
 */
export function BalanceLede({
  reading,
  durationS,
}: {
  reading: BalanceReading
  durationS: number
}) {
  if (reading.unit === 'percent') return <>{balanceSummary(reading, durationS)}</>
  const centre = wholeCentre(reading.lead)
  const at = `at ${HEADLINE_LABEL.replace(' ', ' ')}`
  const grade = <Definition meaning={DEFINITIONS.ageGrade}>age grade</Definition>
  const verdict = rangeVerdictText(reading)
  const { lead, other } = subjects(reading)
  return (
    <>
      {centre === 0 ? (
        <>
          Running and cycling have the same {grade} {at}.
        </>
      ) : (
        <>
          {lead} {grade} is {plural(Math.abs(centre), 'point')} higher than {other} {at}.
        </>
      )}
      {verdict === null ? null : (
        <>
          {' '}
          The <Definition meaning={DEFINITIONS.range90}>90% range</Definition> is{' '}
          {rangeText(reading)}, {verdict}.
        </>
      )}
    </>
  )
}
