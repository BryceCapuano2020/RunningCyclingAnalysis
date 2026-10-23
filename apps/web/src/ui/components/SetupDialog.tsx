import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { UnitSystem } from '@rca/core/units'
import {
  UNIT_OPTIONS,
  displayBirthYear,
  displayWeight,
  readBirthYear,
  readWeight,
  weightKg,
  weightUnit,
} from '../athlete'
import { focusPageHeading } from '../pages/pageHeading'
import type { AthleteValues, ProfilePatch } from '../profilePatch'
import { AthleteFields } from './AthleteFields'
import { NumberField } from './NumberField'
import { SegmentedControl } from './SegmentedControl'
import './SetupDialog.css'

export interface SetupDialogProps {
  /** What the dialog starts from: the saved values, or the signed-in profile. */
  initial: AthleteValues
  /** While the answers are being stored. The buttons and Escape wait for it. */
  saving?: boolean
  /** Why the answers could not be stored. The dialog stays open with what was typed. */
  error?: string | null
  /** A signed-out visitor whose results are already kept in this browser gets a lighter heading. */
  returning?: boolean
  /** Receives only the fields the athlete changed, so a save leaves the others alone. */
  onConfirm: (patch: ProfilePatch) => void
  /** Escape and Skip. Nothing the athlete typed is kept. */
  onSkip: () => void
}

interface FieldErrors {
  weight?: string
  year?: string
}

/**
 * The questions asked once, before the first analysis. Mounted only while it is open, so each
 * opening starts from the current values. Escape is Skip.
 */
export function SetupDialog({
  initial,
  saving = false,
  error = null,
  returning = false,
  onConfirm,
  onSkip,
}: SetupDialogProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const helpId = `${baseId}-help`
  const dialogRef = useRef<HTMLDialogElement>(null)
  const weightRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  const savedKg = weightKg(initial.settings, 'body')
  const [units, setUnits] = useState<UnitSystem>(initial.units)
  // The last weight that was valid. The text can be a rounded display of it, which is saved as this
  // exact weight rather than as the rounded figure.
  const [validKg, setValidKg] = useState(savedKg)
  const [weightText, setWeightText] = useState(() => displayWeight(savedKg, initial.units))
  const [yearText, setYearText] = useState(() => displayBirthYear(initial.birthYear))
  const [sex, setSex] = useState(initial.sex)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Modal while mounted. Focus goes back to whatever opened the dialog, or to the page heading when
  // that has gone (a file dropped on the page opened it from the body).
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const opener = document.activeElement
    // jsdom has no showModal, so the open attribute stands in for it there.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
        opener.focus()
      } else {
        focusPageHeading()
      }
    }
  }, [])

  function changeUnits(next: UnitSystem) {
    // Text that still shows the last valid weight is only reformatted. Anything typed is read first,
    // in the units it was typed in, and then shown in the new ones.
    const typed =
      weightText === displayWeight(validKg, units)
        ? { kg: validKg }
        : readWeight(weightText, 'body', units)
    if ('error' in typed) {
      // The text stays as typed, so it is judged again in the new units.
      const judged = readWeight(weightText, 'body', next)
      setErrors((current) => ({ ...current, weight: 'error' in judged ? judged.error : undefined }))
    } else {
      setValidKg(typed.kg)
      setWeightText(displayWeight(typed.kg, next))
      setErrors((current) => ({ ...current, weight: undefined }))
    }
    setUnits(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const patch: ProfilePatch = {}
    const next: FieldErrors = {}
    let kg = validKg
    if (weightText !== displayWeight(validKg, units)) {
      const read = readWeight(weightText, 'body', units)
      if ('error' in read) next.weight = read.error
      else kg = read.kg
    }
    if (next.weight === undefined && kg !== savedKg) {
      patch.settings = { ...initial.settings, massKg: kg }
    }
    if (yearText !== displayBirthYear(initial.birthYear)) {
      const read = readBirthYear(yearText)
      if ('error' in read) next.year = read.error
      else patch.birthYear = read.year
    }
    if (next.weight !== undefined || next.year !== undefined) {
      setErrors(next)
      if (next.weight !== undefined) weightRef.current?.focus()
      else yearRef.current?.focus()
      return
    }
    if (sex !== initial.sex) patch.sex = sex
    if (units !== initial.units) patch.units = units
    onConfirm(patch)
  }

  return (
    <dialog
      ref={dialogRef}
      className="setup-dialog"
      aria-labelledby={titleId}
      aria-describedby={helpId}
      onCancel={(event) => {
        // Escape goes through onSkip so the parent owns the open state.
        event.preventDefault()
        if (!saving) onSkip()
      }}
    >
      <form className="setup-dialog__form" onSubmit={handleSubmit} noValidate>
        <h2 id={titleId}>{returning ? 'A few details' : 'Before your first analysis'}</h2>
        <p id={helpId} className="setup-dialog__help">
          Weight puts watts and pace on the same scale. Age and sex are optional and only used to
          grade your results against age standards. They stay on this device unless you sign in.
        </p>
        <NumberField
          ref={weightRef}
          id={`${baseId}-weight`}
          label="Body weight"
          unit={weightUnit(units)}
          inputMode="decimal"
          autoComplete="off"
          value={weightText}
          error={errors.weight ?? null}
          onChange={(event) => {
            setErrors((current) => ({ ...current, weight: undefined }))
            setWeightText(event.target.value)
          }}
        />
        <SegmentedControl
          legend="Units"
          options={UNIT_OPTIONS}
          selected={units}
          onSelect={changeUnits}
        />
        <AthleteFields
          birthYear={yearText}
          birthYearError={errors.year ?? null}
          birthYearRef={yearRef}
          sex={sex}
          onBirthYearChange={(text) => {
            setErrors((current) => ({ ...current, year: undefined }))
            setYearText(text)
          }}
          onSexChange={setSex}
        />
        {error && (
          <p role="alert" className="setup-dialog__error">
            {error}
          </p>
        )}
        <div className="setup-dialog__actions">
          <button
            type="button"
            className="btn"
            aria-disabled={saving}
            onClick={() => {
              if (!saving) onSkip()
            }}
          >
            Skip for now
          </button>
          <button type="submit" className="btn btn-primary" aria-disabled={saving}>
            Analyse my files
          </button>
        </div>
      </form>
    </dialog>
  )
}
