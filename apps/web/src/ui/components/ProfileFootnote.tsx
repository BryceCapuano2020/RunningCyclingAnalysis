import type { Sex } from '@rca/core/grade'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, weightUnit } from '../athlete'
import { SEX_NOUN, ageToday } from '../grades'
import { hrefFor } from '../route'

export interface ProfileFootnoteProps {
  /** The body weight in kg, or null while none is entered, so the line does not name one. */
  massKg: number | null
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  /** False where the page already links to Profile from a note of its own, so the unset line leaves its link out. */
  unsetLink?: boolean
}

/**
 * The line at the foot of a results page that says what it is based on, with a link to Profile.
 * A part the athlete has not set is left out, so nothing is assumed.
 */
export function ProfileFootnote({
  massKg,
  units,
  birthYear,
  sex,
  unsetLink = true,
}: ProfileFootnoteProps) {
  const age = birthYear === null ? null : ageToday(birthYear)
  const parts = [
    massKg === null ? null : `${displayWeight(massKg, units)} ${weightUnit(units)}`,
    age === null ? null : `age ${age}`,
    sex === null ? null : SEX_NOUN[sex],
  ].filter((part): part is string => part !== null)
  const unset = parts.length === 0
  return (
    <p className="muted">
      {unset ? 'Your details are not set yet.' : `Based on ${parts.join(', ')}.`}
      {(!unset || unsetLink) && (
        <>
          {' '}
          <a href={hrefFor({ page: 'profile' })}>
            {unset ? 'Add them on Profile' : 'Change on Profile'}
          </a>
        </>
      )}
    </p>
  )
}
