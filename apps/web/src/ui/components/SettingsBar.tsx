import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { displayWeight, readWeight, weightKg, weightUnit } from '../athlete'
import type { WeightField, WeightSettings } from '../athlete'
import { isTypicalBodyKg, unusualKgText, unusualWeightSentence } from '../typicalWeight'
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
  const barRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  // Set when the body weight is left for another control in this bar, so that focus can go on to the
  // question's Save control once it renders. Focus that leaves the bar is never pulled back.
  const moveToSave = useRef(false)
  // The text being typed in one field. Null means the field shows the saved value. The text stays
  // until it is saved, so a refused entry is still there to correct.
  const [draft, setDraft] = useState<{ field: WeightField; text: string } | null>(null)
  const [error, setError] = useState<{ field: WeightField; message: string } | null>(null)
  // The body weight outside the typical range that the athlete may save as typed. Raised when the
  // field is left.
  const [unusual, setUnusual] = useState<number | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  // The units the bar last showed. A change of units drops the draft, its error and its question:
  // the same figures would mean other things in the new units.
  const [shownUnits, setShownUnits] = useState(units)
  if (units !== shownUnits) {
    setShownUnits(units)
    setDraft(null)
    setError(null)
    setUnusual(null)
    setStatus('idle')
  }

  useEffect(() => {
    if (!moveToSave.current) return
    moveToSave.current = false
    saveRef.current?.focus()
  })

  function shownText(field: WeightField): string {
    if (draft !== null && draft.field === field) return draft.text
    return displayWeight(weightKg(settings, field), units)
  }

  async function saveChange(field: WeightField, kg: number) {
    setStatus('saving')
    const change = field === 'body' ? { massKg: kg } : { bikeMassKg: kg }
    try {
      await onChange(change)
      setError(null)
      setUnusual(null)
      setDraft(null)
      setStatus('saved')
    } catch {
      // A refused change keeps its draft, so the question and its save control stay until it is tried again.
      setStatus('failed')
    }
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
    // Leaving the field does not save a body weight outside the typical range: it asks first.
    if (field === 'body' && !isTypicalBodyKg(read.kg)) {
      setError({
        field,
        message: `${unusualWeightSentence(read.kg, text, units)} Check the units, or save it as typed.`,
      })
      setUnusual(read.kg)
      return
    }
    await saveChange(field, read.kg)
  }

  function handleBlur(field: WeightField, event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget
    moveToSave.current =
      field === 'body' && next !== null && barRef.current !== null && barRef.current.contains(next)
    void commit(field)
  }

  function handleKeyDown(field: WeightField, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    moveToSave.current = false
    void commit(field)
  }

  const bodyKnown = settings.massKg !== null
  const hint = bodyKnown
    ? 'Your body weight sets ride W/kg and the balance. Bike and gear weight is used for power on climbs.'
    : `Not entered. Add your weight ${WEIGHT_PURPOSE}`

  return (
    <div className="settings-bar" ref={barRef}>
      <div className="settings-bar__fields">
        {FIELDS.map((field) => {
          const fieldError = error !== null && error.field === field ? error.message : null
          return (
            <div key={field} className="settings-bar__field">
              <NumberField
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
                  moveToSave.current = false
                  setError(null)
                  setUnusual(null)
                  setStatus('idle')
                  setDraft({ field, text: event.target.value })
                }}
                onBlur={(event) => handleBlur(field, event)}
                onKeyDown={(event) => handleKeyDown(field, event)}
              />
              {field === 'body' && unusual !== null && (
                <button
                  ref={saveRef}
                  type="button"
                  className="btn"
                  onClick={() => void saveChange('body', unusual)}
                >
                  Save {unusualKgText(unusual)} kg
                </button>
              )}
            </div>
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
