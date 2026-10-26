import { useId, useState } from 'react'
import type { Ref } from 'react'
import type { Sex } from '@rca/contract'
import { SEX_NOUN } from '../grades'
import { NumberField } from './NumberField'
import { SegmentedControl } from './SegmentedControl'
import type { SegmentedControlOption } from './SegmentedControl'
import './AthleteFields.css'

export interface AthleteFieldsProps {
  /** The year as typed. Empty when there is none. */
  birthYear: string
  /** Why the typed year cannot be used. */
  birthYearError?: string | null
  birthYearRef?: Ref<HTMLInputElement>
  /** Null until a sex is chosen. */
  sex: Sex | null
  onBirthYearChange: (text: string) => void
  /** Called when the year is left, or Enter is pressed. */
  onBirthYearCommit?: () => void
  onSexChange: (sex: Sex | null) => void
}

type SexChoice = Sex | 'unspecified'

/** The sex terms are the grades' own (SEX_NOUN), so the form and the grades use the same words. */
const SEX_OPTIONS: SegmentedControlOption<SexChoice>[] = [
  { value: 'female', label: capitalised(SEX_NOUN.female) },
  { value: 'male', label: capitalised(SEX_NOUN.male) },
  { value: 'unspecified', label: 'Prefer not to say' },
]

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * The optional year of birth and sex, used only to grade results by age. Callers own the values.
 * Prefer not to say is stored as no sex, so it is shown as chosen only while this view stays open.
 */
export function AthleteFields({
  birthYear,
  birthYearError = null,
  birthYearRef,
  sex,
  onBirthYearChange,
  onBirthYearCommit,
  onSexChange,
}: AthleteFieldsProps) {
  const baseId = useId()
  const hintId = `${baseId}-hint`
  const [declined, setDeclined] = useState(false)
  const selected: SexChoice | null = sex ?? (declined ? 'unspecified' : null)
  return (
    <fieldset className="athlete-fields">
      <legend className="athlete-fields__legend">Your level (optional)</legend>
      <NumberField
        ref={birthYearRef}
        id={`${baseId}-year`}
        label="Year of birth"
        inputMode="numeric"
        autoComplete="bday-year"
        enterKeyHint="done"
        value={birthYear}
        error={birthYearError}
        aria-describedby={hintId}
        onChange={(event) => onBirthYearChange(event.target.value)}
        onBlur={() => onBirthYearCommit?.()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onBirthYearCommit?.()
        }}
      />
      <SegmentedControl
        legend="Sex"
        options={SEX_OPTIONS}
        selected={selected}
        onSelect={(choice) => {
          setDeclined(choice === 'unspecified')
          onSexChange(choice === 'unspecified' ? null : choice)
        }}
      />
      <p id={hintId} className="athlete-fields__hint muted">
        Used only to grade your results by age. Standards differ for women and men, so without sex
        no level is shown.
      </p>
    </fieldset>
  )
}
