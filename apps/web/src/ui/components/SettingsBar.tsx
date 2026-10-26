import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, readWeight, weightKg, weightUnit } from '../athlete'
import type { WeightField, WeightSettings } from '../athlete'
import { NumberField } from './NumberField'
import './SettingsBar.css'
import { WEIGHT_PURPOSE } from '../weightCopy'

export interface SettingsBarProps {
  settings: WeightSettings
  units: UnitSystem
  /**
   * Saves the one weight that changed, and only that one, so the other saved weight is left alone.
   * A promise lets the bar say it is saving, saved, or could not save; a plain return is saved at once.
   */
  onChange: (change: Partial<WeightSettings>) => void | Promise<void>
}

const LABELS: Record<WeightField, string> = {
  body: 'Body weight',
  bike: 'Bike and gear weight',
}

const FIELDS: WeightField[] = ['body', 'bike']

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved. Balance and ride results now use this.',
  failed: "Couldn't save. Try again.",
}

export function SettingsBar({ settings, units, onChange }: SettingsBarProps) {
  const baseId = useId()
  const hintId = `${baseId}-hint`
  // The text being typed in one field. Null means the field shows the saved value. The text stays
  // until it is saved, so a refused entry is still there to correct.
  const [draft, setDraft] = useState<{ field: WeightField; text: string } | null>(null)
  const [error, setError] = useState<{ field: WeightField; message: string } | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')

  function shownText(field: WeightField): string {
    if (draft !== null && draft.field === field) return draft.text
    return displayWeight(weightKg(settings, field), units)
  }

  async function commit(field: WeightField) {
    if (draft === null || draft.field !== field) return
    const { text } = draft
    if (text === displayWeight(weightKg(settings, field), units)) {
      setDraft(null)
      return
    }

    const read = readWeight(text, field, units)
    if ('error' in read) {
      setError({ field, message: read.error })
      return
    }
    setError(null)
    setStatus('saving')
    const change = field === 'body' ? { massKg: read.kg } : { bikeMassKg: read.kg }
    try {
      await onChange(change)
      setDraft(null)
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  function handleKeyDown(field: WeightField, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void commit(field)
  }

  const bodyKnown = settings.massKg !== null
  const hint = bodyKnown
    ? 'Your body weight sets ride W/kg and the balance. Bike and gear weight is used for power on climbs.'
    : `Not entered. Add your weight ${WEIGHT_PURPOSE}`

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
              enterKeyHint="done"
              value={shownText(field)}
              error={fieldError}
              aria-describedby={hintId}
              onChange={(event) => {
                setError(null)
                setStatus('idle')
                setDraft({ field, text: event.target.value })
              }}
              onBlur={() => void commit(field)}
              onKeyDown={(event) => handleKeyDown(field, event)}
            />
          )
        })}
      </div>
      <p id={hintId} className="settings-bar__hint muted">
        {hint}
      </p>
      <p role="status" className="settings-bar__status">
        {STATUS_TEXT[status]}
      </p>
    </div>
  )
}
