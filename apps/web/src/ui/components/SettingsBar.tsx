import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import { kgToLb, lbToKg } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import './SettingsBar.css'

export interface SettingsBarProps {
  settings: AthleteSettings
  units: UnitSystem
  onChange: (settings: AthleteSettings) => void
}

type Field = 'body' | 'bike'

const LABELS: Record<Field, string> = {
  body: 'Body weight',
  bike: 'Bike and kit weight',
}

/** Limits in kg, checked after converting what was typed. */
const LIMITS_KG: Record<Field, { min: number; max: number }> = {
  body: { min: 30, max: 200 },
  bike: { min: 3, max: 30 },
}

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/

function kgOf(settings: AthleteSettings, field: Field): number {
  return field === 'body' ? settings.massKg : settings.bikeMassKg
}

/** One decimal, or a whole number when the value is within 0.05 of one. */
function displayValue(kg: number, units: UnitSystem): string {
  const value = units === 'imperial' ? kgToLb(kg) : kg
  const whole = Math.round(value)
  if (Math.abs(value - whole) < 0.05) return String(whole)
  return value.toFixed(1)
}

/** Whole display-unit limits, inside the kg limits. */
function displayLimits(field: Field, units: UnitSystem): { lo: number; hi: number } {
  const { min, max } = LIMITS_KG[field]
  if (units === 'metric') return { lo: min, hi: max }
  return { lo: Math.ceil(kgToLb(min)), hi: Math.floor(kgToLb(max)) }
}

/** kg for typed text, or null when the text is not a decimal number. */
function parseKg(text: string, units: UnitSystem): number | null {
  const trimmed = text.trim()
  if (!DECIMAL.test(trimmed)) return null
  const value = Number(trimmed)
  return units === 'imperial' ? lbToKg(value) : value
}

export function SettingsBar({ settings, units, onChange }: SettingsBarProps) {
  const baseId = useId()
  const hintId = `${baseId}-hint`
  // The text being typed in one field. Null means the field shows the saved value.
  const [draft, setDraft] = useState<{ field: Field; text: string } | null>(null)
  const [error, setError] = useState<{ field: Field; message: string } | null>(null)

  function shownText(field: Field): string {
    if (draft !== null && draft.field === field) return draft.text
    return displayValue(kgOf(settings, field), units)
  }

  function commit(field: Field) {
    if (draft === null || draft.field !== field) return
    const { text } = draft
    setDraft(null)
    if (text === displayValue(kgOf(settings, field), units)) return

    const kg = parseKg(text, units)
    if (kg === null) {
      setError({ field, message: 'Enter a number' })
      return
    }
    const { min, max } = LIMITS_KG[field]
    if (kg < min || kg > max) {
      const { lo, hi } = displayLimits(field, units)
      const unit = units === 'imperial' ? 'lb' : 'kg'
      setError({ field, message: `Enter a weight from ${lo} to ${hi} ${unit}` })
      return
    }
    setError(null)
    onChange(field === 'body' ? { ...settings, massKg: kg } : { ...settings, bikeMassKg: kg })
  }

  function handleKeyDown(field: Field, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit(field)
  }

  const unit = units === 'imperial' ? 'lb' : 'kg'

  return (
    <div className="settings-bar">
      <div className="settings-bar__fields">
        {(['body', 'bike'] as const).map((field) => {
          const inputId = `${baseId}-${field}`
          const unitId = `${baseId}-${field}-unit`
          const errorId = `${baseId}-${field}-error`
          const fieldError = error !== null && error.field === field ? error : null
          const describedBy = [unitId, hintId, fieldError ? errorId : null]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={field} className="settings-bar__field">
              <label className="settings-bar__label" htmlFor={inputId}>
                {LABELS[field]}
              </label>
              <div className="settings-bar__input">
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={shownText(field)}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => {
                    setError(null)
                    setDraft({ field, text: event.target.value })
                  }}
                  onBlur={() => commit(field)}
                  onKeyDown={(event) => handleKeyDown(field, event)}
                />
                <span id={unitId} className="settings-bar__unit">
                  {unit}
                </span>
              </div>
              {fieldError && (
                <p id={errorId} role="alert" className="settings-bar__error">
                  {fieldError.message}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p id={hintId} className="settings-bar__hint muted">
        Weight changes every number on this page, so use your real figure
      </p>
    </div>
  )
}
