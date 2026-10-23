import { useId } from 'react'
import type { Ref } from 'react'
import type { Sex } from '@rca/contract'
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
  sex: Sex | null
  onBirthYearChange: (text: string) => void
  /** Called when the year is left, or Enter is pressed. */
  onBirthYearCommit?: () => void
  onSexChange: (sex: Sex | null) => void
}

type SexChoice = Sex | 'unspecified'

const SEX_OPTIONS: SegmentedControlOption<SexChoice>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
]

/** The optional year of birth and sex, used only to grade results by age. Callers own the values. */
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
  return (
    <div className="athlete-fields">
      <NumberField
        ref={birthYearRef}
        id={`${baseId}-year`}
        label="Year of birth"
        inputMode="numeric"
        autoComplete="off"
        value={birthYear}
        error={birthYearError}
        aria-describedby={hintId}
        onChange={(event) => onBirthYearChange(event.target.value)}
        onBlur={() => onBirthYearCommit?.()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onBirthYearCommit?.()
        }}
      />
      <p id={hintId} className="athlete-fields__hint muted">
        Optional. Used only to grade your results by age.
      </p>
      <SegmentedControl
        legend="Sex"
        options={SEX_OPTIONS}
        selected={sex ?? 'unspecified'}
        onSelect={(choice) => onSexChange(choice === 'unspecified' ? null : choice)}
      />
    </div>
  )
}
