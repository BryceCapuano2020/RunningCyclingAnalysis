import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { EQUIPMENT, exerciseInfo } from '@rca/core/lift'
import type { Equipment, LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { NumberField } from '../components/NumberField'
import { equipmentName, liftName } from './liftNames'
import { RPE_CHOICES, loadText, readSetForm } from './setFormValues'
import type { SetFormErrors } from './setFormValues'
import './SetForm.css'

export interface SetFormProps {
  /** The chosen lift's slug. */
  exercise: string
  /** Local date of the set, YYYY-MM-DD. */
  date: string
  /** The set order a saved set carries; the page picks the next one. */
  setOrder: number
  units: UnitSystem
  /** Equipment when nothing is filled in yet: what the lift last used, else the lift's usual. */
  defaultEquipment?: Equipment
  /** Values to start from, in kilograms: the last set, or the set being edited. */
  initial?: Partial<Pick<LiftSet, 'equipment' | 'reps' | 'loadKg' | 'rpe' | 'warmup'>>
  /** A valid set. The values stay for the next one. */
  onSave: (set: LiftSet) => void
  /** Present only when editing a saved set. */
  onDelete?: () => void
  onDone: () => void
}

/** The entry fields for one set: equipment, reps, load, effort and warm-up. */
export function SetForm(props: SetFormProps) {
  const { exercise, date, setOrder, units, initial, onSave, onDelete, onDone } = props
  const baseId = useId()
  const info = exerciseInfo(exercise)
  const [equipment, setEquipment] = useState<Equipment>(
    initial?.equipment ?? props.defaultEquipment ?? (info.bodyweight ? 'bodyweight' : 'barbell'),
  )
  const [reps, setReps] = useState(initial?.reps === undefined ? '' : String(initial.reps))
  const [load, setLoad] = useState(
    initial?.loadKg === undefined ? '' : loadText(initial.loadKg, units),
  )
  const [rpe, setRpe] = useState(initial?.rpe === undefined ? '' : String(initial.rpe))
  const [warmup, setWarmup] = useState(initial?.warmup === true)
  const [errors, setErrors] = useState<SetFormErrors>({})
  const bodyweight = info.bodyweight === true || equipment === 'bodyweight'
  const rpeChoices =
    initial?.rpe !== undefined && !RPE_CHOICES.includes(initial.rpe)
      ? [initial.rpe, ...RPE_CHOICES]
      : RPE_CHOICES

  const save = (event: FormEvent) => {
    event.preventDefault()
    const result = readSetForm(
      { equipment, reps, load, rpe, warmup },
      units,
      { date, exercise, setOrder },
      bodyweight,
    )
    if ('errors' in result) return setErrors(result.errors)
    setErrors({})
    onSave(result.set)
  }

  return (
    <form className="set-form" aria-label={liftName(exercise)} onSubmit={save} noValidate>
      <div className="set-form__field">
        <label htmlFor={`${baseId}-equipment`}>Equipment</label>
        <select
          id={`${baseId}-equipment`}
          value={equipment}
          onChange={(event) => setEquipment(event.target.value as Equipment)}
        >
          {EQUIPMENT.map((item) => (
            <option key={item} value={item}>
              {equipmentName(item)}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        id={`${baseId}-reps`}
        label="Reps"
        inputMode="numeric"
        autoComplete="off"
        value={reps}
        error={errors.reps ?? null}
        onChange={(event) => setReps(event.target.value)}
      />
      <NumberField
        id={`${baseId}-load`}
        label={bodyweight ? 'Added load' : 'Load'}
        unit={units === 'imperial' ? 'lb' : 'kg'}
        inputMode="decimal"
        autoComplete="off"
        value={load}
        error={errors.load ?? null}
        onChange={(event) => setLoad(event.target.value)}
      />
      <div className="set-form__field">
        <label htmlFor={`${baseId}-rpe`}>Effort (RPE)</label>
        <select id={`${baseId}-rpe`} value={rpe} onChange={(event) => setRpe(event.target.value)}>
          <option value="">Not rated</option>
          {rpeChoices.map((choice) => (
            <option key={choice} value={String(choice)}>
              {choice}
            </option>
          ))}
        </select>
      </div>
      <label className="set-form__check">
        <input
          type="checkbox"
          checked={warmup}
          onChange={(event) => setWarmup(event.target.checked)}
        />
        Warm-up
      </label>
      <div className="set-form__actions">
        <button type="submit" className="btn">
          Save
        </button>
        {onDelete && (
          <button type="button" className="btn" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </form>
  )
}
