import type { Sex } from '@rca/core/grade'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, weightUnit } from '../athlete'
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

/** A list in words: "your age", "your age and sex", "your age, sex and 75 kg". */
function listed(parts: string[]): string {
  const last = parts.at(-1)
  return parts.length < 2 ? (last ?? '') : `${parts.slice(0, -1).join(', ')} and ${last}`
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
  // Each grade is at the age on the day of its effort, which its own line states, so today's age is not given
  // here to disagree with it: the line says only that the year of birth is used. The sex is named by its place on
  // Profile, not repeated.
  const parts = [
    birthYear === null ? null : 'your age',
    sex === null ? null : 'sex',
    massKg === null ? null : `${displayWeight(massKg, units)} ${weightUnit(units)}`,
  ].filter((part): part is string => part !== null)
  const unset = parts.length === 0
  return (
    <p className="muted">
      {unset ? 'Your details are not set yet.' : `Based on ${listed(parts)}.`}
      {(!unset || unsetLink) && (
        <>
          {' '}
          {unset ? (
            <a href={hrefFor({ page: 'profile' })}>Add them on Profile</a>
          ) : (
            <a href={hrefFor({ page: 'profile' })} aria-label="Edit your details on Profile">
              Edit
            </a>
          )}
        </>
      )}
    </p>
  )
}
