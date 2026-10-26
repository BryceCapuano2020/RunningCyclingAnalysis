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
import { WEIGHT_PROMPT_TEXT } from '../weightCopy'

export interface SetupDialogProps {
  /** What the dialog starts from: the saved values, or the signed-in profile. */
  initial: AthleteValues
  /** While the answers are being stored. The buttons and Escape wait for it. */
  saving?: boolean
  /** Why the answers could not be stored. The dialog stays open with what was typed. */
  error?: string | null
  /** Receives only the fields the athlete changed, so a save leaves the others alone. */
  onConfirm: (patch: ProfilePatch) => void
  /** Escape and Skip. Nothing the athlete typed is kept. */
  onSkip: () => void
}

interface FieldErrors {
  weight?: string
  year?: string
}

type WeightEntry = { kg: number | null } | { error: string }

/**
 * The body weight the text stands for. Text that still shows the last valid weight is that weight,
 * so a rounded display is saved as the exact value. Blank text is no weight, which is fine until
 * one is saved: once a weight is saved, blanking the field is an error, so it is only replaced.
 */
function readWeightEntry(text: string, validKg: number | null, units: UnitSystem): WeightEntry {
  if (text === displayWeight(validKg, units)) return { kg: validKg }
  return readWeight(text, 'body', units)
}

/**
 * The questions asked once, before the first analysis. Mounted only while it is open, so each
 * opening starts from the current values. Escape is Skip.
 */
export function SetupDialog({
  initial,
  saving = false,
  error = null,
  onConfirm,
  onSkip,
}: SetupDialogProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const helpId = `${baseId}-help`
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const weightRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  const savedKg = weightKg(initial.settings, 'body')
  const [units, setUnits] = useState<UnitSystem>(initial.units)
  // The last weight that was valid, null when none has been entered.
  const [validKg, setValidKg] = useState<number | null>(savedKg)
  const [weightText, setWeightText] = useState(() => displayWeight(savedKg, initial.units))
  const [yearText, setYearText] = useState(() => displayBirthYear(initial.birthYear))
  const [sex, setSex] = useState(initial.sex)
  const [errors, setErrors] = useState<FieldErrors>({})
  // A field the visitor has changed keeps their answer. An untouched one follows the saved value, which
  // can arrive while the questions are open, since the account may answer after they have opened.
  const touched = useRef({ units: false, weight: false, year: false, sex: false })
  useEffect(() => {
    // The saved weight is shown in the units the visitor is looking at, which they may have changed.
    const shownUnits = touched.current.units ? units : initial.units
    if (!touched.current.units) setUnits(initial.units)
    if (!touched.current.weight) {
      setValidKg(savedKg)
      setWeightText(displayWeight(savedKg, shownUnits))
    }
    if (!touched.current.year) setYearText(displayBirthYear(initial.birthYear))
    if (!touched.current.sex) setSex(initial.sex)
  }, [units, initial.units, initial.birthYear, initial.sex, savedKg])

  // Modal while mounted. Focus goes to the heading rather than a field, so a phone does not raise
  // the keyboard before the dialog has been read. It returns to whatever opened the dialog, or to
  // the page heading when that has gone (a file dropped on the page opened it from the body).
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const opener = document.activeElement
    // jsdom has no showModal, so the open attribute stands in for it there.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    headingRef.current?.focus()
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
    touched.current.units = true
    // The weight is read in the units it was typed in, then shown in the new ones.
    const typed = readWeightEntry(weightText, validKg, units)
    if ('error' in typed) {
      // The text stays as typed, so it is judged again in the new units.
      const judged = readWeightEntry(weightText, validKg, next)
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
    const entry = readWeightEntry(weightText, validKg, units)
    if ('error' in entry) next.weight = entry.error
    else if (entry.kg !== null && entry.kg !== savedKg) {
      patch.settings = { massKg: entry.kg }
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

  const entry = readWeightEntry(weightText, validKg, units)
  const weightBlank = !('error' in entry) && entry.kg === null
  const storedKg = !('error' in entry) && entry.kg !== null ? entry.kg : null

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
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>
          A few details
        </h2>
        <p id={helpId} className="setup-dialog__help">
          Your weight puts rides and runs on one scale. Age and sex are optional: they set your
          level in each sport. They stay on this device unless you sign in.
        </p>
        <SegmentedControl
          legend="Units"
          options={UNIT_OPTIONS}
          selected={units}
          onSelect={changeUnits}
        />
        <NumberField
          ref={weightRef}
          id={`${baseId}-weight`}
          label="Body weight"
          unit={weightUnit(units)}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={weightText}
          error={errors.weight ?? null}
          onChange={(event) => {
            touched.current.weight = true
            setErrors((current) => ({ ...current, weight: undefined }))
            setWeightText(event.target.value)
          }}
        />
        {units === 'imperial' && storedKg !== null && (
          <p className="setup-dialog__note muted">
            Stored as {displayWeight(storedKg, 'metric')} kg
          </p>
        )}
        <AthleteFields
          birthYear={yearText}
          birthYearError={errors.year ?? null}
          birthYearRef={yearRef}
          sex={sex}
          onBirthYearChange={(text) => {
            touched.current.year = true
            setErrors((current) => ({ ...current, year: undefined }))
            setYearText(text)
          }}
          onSexChange={(next) => {
            touched.current.sex = true
            setSex(next)
          }}
        />
        {error && (
          <p role="alert" className="setup-dialog__error">
            {error}
          </p>
        )}
        <div className="setup-dialog__footer">
          {weightBlank && <p className="setup-dialog__note muted">{WEIGHT_PROMPT_TEXT}</p>}
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
        </div>
      </form>
    </dialog>
  )
}
