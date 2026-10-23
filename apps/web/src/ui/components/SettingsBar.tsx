import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, readWeight, weightKg, weightUnit } from '../athlete'
import type { WeightField } from '../athlete'
import { NumberField } from './NumberField'
import './SettingsBar.css'

export interface SettingsBarProps {
  settings: AthleteSettings
  units: UnitSystem
  onChange: (settings: AthleteSettings) => void
}

const LABELS: Record<WeightField, string> = {
  body: 'Body weight',
  bike: 'Bike and kit weight',
}

const FIELDS: WeightField[] = ['body', 'bike']

export function SettingsBar({ settings, units, onChange }: SettingsBarProps) {
  const baseId = useId()
  const hintId = `${baseId}-hint`
  // The text being typed in one field. Null means the field shows the saved value.
  const [draft, setDraft] = useState<{ field: WeightField; text: string } | null>(null)
  const [error, setError] = useState<{ field: WeightField; message: string } | null>(null)

  function shownText(field: WeightField): string {
    if (draft !== null && draft.field === field) return draft.text
    return displayWeight(weightKg(settings, field), units)
  }

  function commit(field: WeightField) {
    if (draft === null || draft.field !== field) return
    const { text } = draft
    setDraft(null)
    if (text === displayWeight(weightKg(settings, field), units)) return

    const read = readWeight(text, field, units)
    if ('error' in read) {
      setError({ field, message: read.error })
      return
    }
    setError(null)
    onChange(
      field === 'body' ? { ...settings, massKg: read.kg } : { ...settings, bikeMassKg: read.kg },
    )
  }

  function handleKeyDown(field: WeightField, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit(field)
  }

  return (
    <div className="settings-bar">
      <div className="settings-bar__fields">
        {FIELDS.map((field) => {
          const fieldError = error !== null && error.field === field ? error.message : null
          return (
            <NumberField
              key={field}
              id={`${baseId}-${field}`}
              label={LABELS[field]}
              unit={weightUnit(units)}
              inputMode="decimal"
              autoComplete="off"
              value={shownText(field)}
              error={fieldError}
              aria-describedby={hintId}
              onChange={(event) => {
                setError(null)
                setDraft({ field, text: event.target.value })
              }}
              onBlur={() => commit(field)}
              onKeyDown={(event) => handleKeyDown(field, event)}
            />
          )
        })}
      </div>
      <p id={hintId} className="settings-bar__hint muted">
        Your weight puts watts and pace on the same scale, so enter your real weight.
      </p>
    </div>
  )
}
