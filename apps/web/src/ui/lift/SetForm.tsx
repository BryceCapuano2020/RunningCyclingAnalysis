import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { EQUIPMENT, exerciseInfo } from '@rca/core/lift'
import type { Equipment, LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { NumberField } from '../components/NumberField'
import { equipmentName, liftName } from './liftNames'
import { RPE_CHOICES, loadText, readSetForm, snapRpe } from './setFormValues'
import type { SetFormErrors, SetFormText } from './setFormValues'
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
  initial?: Partial<
    Pick<LiftSet, 'equipment' | 'reps' | 'loadKg' | 'rpe' | 'warmup' | 'time' | 'timePrecision'>
  >
  /** The clock a new set is stamped from; tests pass a fixed one. */
  now?: () => Date
  /** A valid set. The values stay for the next one. */
  onSave: (set: LiftSet) => void
  /** Present only when editing a saved set. */
  onDelete?: () => void
  onDone: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** The entry fields for one set: equipment, reps, load, effort and warm-up. */
export function SetForm(props: SetFormProps) {
  const { exercise, date, setOrder, units, initial, onSave, onDelete, onDone } = props
  const now = props.now ?? (() => new Date())
  const baseId = useId()
  const info = exerciseInfo(exercise)
  const start = (): SetFormText => ({
    equipment:
      initial?.equipment ?? props.defaultEquipment ?? (info.bodyweight ? 'bodyweight' : 'barbell'),
    reps: initial?.reps === undefined ? '' : String(initial.reps),
    load: initial?.loadKg === undefined ? '' : loadText(initial.loadKg, units),
    rpe: initial?.rpe === undefined ? '' : String(snapRpe(initial.rpe) ?? ''),
    warmup: initial?.warmup === true,
  })
  const [fields, setFields] = useState<SetFormText>(start)
  const [errors, setErrors] = useState<SetFormErrors>({})
  // Another lift starts from its own defaults, not the last lift's values.
  const [seen, setSeen] = useState(exercise)
  if (seen !== exercise) {
    setSeen(exercise)
    setFields(start())
    setErrors({})
  }
  const { equipment, reps, load, rpe, warmup } = fields
  const set = <K extends keyof SetFormText>(key: K, value: SetFormText[K]) =>
    setFields((current) => ({ ...current, [key]: value }))
  const bodyweight = info.bodyweight === true || equipment === 'bodyweight'

  const save = (event: FormEvent) => {
    event.preventDefault()
    // A new set is stamped with the local time it was saved; an edited one keeps its own.
    const stamp =
      initial?.time !== undefined && initial.timePrecision !== undefined
        ? { time: initial.time, timePrecision: initial.timePrecision }
        : { time: localTime(now()), timePrecision: 'set' as const }
    const result = readSetForm(fields, units, { date, exercise, setOrder, ...stamp }, bodyweight)
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
          onChange={(event) => set('equipment', event.target.value as Equipment)}
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
        onChange={(event) => set('reps', event.target.value)}
      />
      <NumberField
        id={`${baseId}-load`}
        label={bodyweight ? 'Added load' : 'Load'}
        unit={units === 'imperial' ? 'lb' : 'kg'}
        inputMode="decimal"
        autoComplete="off"
        value={load}
        error={errors.load ?? null}
        onChange={(event) => set('load', event.target.value)}
      />
      <div className="set-form__field">
        <label htmlFor={`${baseId}-rpe`}>Effort (RPE)</label>
        <select
          id={`${baseId}-rpe`}
          value={rpe}
          onChange={(event) => set('rpe', event.target.value)}
        >
          <option value="">Not rated</option>
          {RPE_CHOICES.map((choice) => (
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
          onChange={(event) => set('warmup', event.target.checked)}
        />
        Warm-up
      </label>
      {errors.form && (
        <p role="alert" className="set-form__error">
          {errors.form}
        </p>
      )}
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
