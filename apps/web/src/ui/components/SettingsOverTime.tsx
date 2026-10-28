import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { measurementKey, localDateOf, localDayStartMs } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import type { UnitSystem } from '@rca/core/units'
import { MEASUREMENT_YEARS } from '@rca/contract'
import { messageOf } from '../../api/messageOf'
import { formatDay } from '../format/date'
import {
  displaySetting,
  readSetting,
  SETTING_CHOICES,
  settingLabel,
  settingOrder,
  settingUnit,
} from '../measurementInput'
import type { SettingChoice } from '../measurementInput'
import type { MeasurementsController } from '../useMeasurements'
import { NumberField } from './NumberField'
import './SettingsOverTime.css'

export interface SettingsOverTimeProps {
  entries: readonly Measurement[]
  state: MeasurementsController['state']
  units: UnitSystem
  /** Resolves once the entry is kept. Rejects with the reason when it is not. */
  onAdd: (entry: Measurement) => Promise<unknown>
  onRemove: (entry: Measurement) => Promise<unknown>
}

const FIRST_CHOICE = SETTING_CHOICES[0] as SettingChoice

/** The list's order: one setting after another, and within each the latest date first. */
function listOrder(a: Measurement, b: Measurement): number {
  return settingOrder(a) - settingOrder(b) || (a.from < b.from ? 1 : a.from > b.from ? -1 : 0)
}

function dayText(date: string): string {
  return formatDay(localDayStartMs(date))
}

/**
 * Dated settings: a body weight, a max heart rate or a threshold, in effect from a date. Each
 * activity uses the setting in effect on its own date, so a ride from last year is priced at last
 * year's weight. The entries are listed here, one setting after another, latest date first.
 */
export function SettingsOverTime({
  entries,
  state,
  units,
  onAdd,
  onRemove,
}: SettingsOverTimeProps) {
  const baseId = useId()
  const [choiceId, setChoiceId] = useState(FIRST_CHOICE.id)
  const [text, setText] = useState('')
  const [from, setFrom] = useState(() => localDateOf(Date.now()))
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const choice = SETTING_CHOICES.find((option) => option.id === choiceId) ?? FIRST_CHOICE
  const rows = [...entries].sort(listOrder)
  const yearOk =
    from !== '' &&
    Number(from.slice(0, 4)) >= MEASUREMENT_YEARS.min &&
    Number(from.slice(0, 4)) <= MEASUREMENT_YEARS.max

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const reading = readSetting(choice.kind, text, units)
    if ('error' in reading) {
      setError(reading.error)
      return
    }
    if (!yearOk) {
      setError(`Pick a date from ${MEASUREMENT_YEARS.min} to ${MEASUREMENT_YEARS.max}`)
      return
    }
    const entry: Measurement = {
      kind: choice.kind,
      ...(choice.sport === undefined ? {} : { sport: choice.sport }),
      value: reading.value,
      from,
    }
    setBusy(true)
    setError(null)
    setStatus('')
    try {
      await onAdd(entry)
      setText('')
      setStatus(`Added ${choice.label.toLowerCase()} from ${dayText(from)}.`)
    } catch (failure) {
      setError(messageOf(failure))
    }
    setBusy(false)
  }

  async function remove(entry: Measurement) {
    if (busy) return
    setBusy(true)
    setError(null)
    setStatus('')
    try {
      await onRemove(entry)
      setStatus(
        `Deleted ${settingLabel(entry.kind, entry.sport).toLowerCase()} from ${dayText(entry.from)}.`,
      )
    } catch (failure) {
      setError(messageOf(failure))
    }
    setBusy(false)
  }

  return (
    <section className="section settings-over-time" aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>Settings over time</h2>
      <p className="secondary">
        Date a weight, a max heart rate or a threshold. Each activity uses the setting in effect on
        its own day, so a ride from last year is priced at last year’s weight. Before your first
        entry your earliest one applies. With none, ride results use your current weight, and
        thresholds and zones are estimated from your activities.
      </p>
      <form className="settings-over-time__form" onSubmit={(event) => void add(event)}>
        <label className="settings-over-time__field">
          <span>Setting</span>
          <select
            value={choiceId}
            disabled={state !== 'ready'}
            onChange={(event) => {
              setChoiceId(event.target.value)
              setText('')
              setError(null)
            }}
          >
            {SETTING_CHOICES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          id={`${baseId}-value`}
          label="Value"
          unit={settingUnit(choice.kind, units)}
          inputMode={choice.kind === 'thresholdPace' ? 'text' : 'decimal'}
          autoComplete="off"
          enterKeyHint="done"
          disabled={state !== 'ready'}
          value={text}
          onChange={(event) => {
            setError(null)
            setText(event.target.value)
          }}
        />
        <label className="settings-over-time__field">
          <span>From</span>
          <input
            type="date"
            value={from}
            disabled={state !== 'ready'}
            onChange={(event) => {
              setError(null)
              setFrom(event.target.value)
            }}
          />
        </label>
        <button type="submit" className="btn" disabled={busy || state !== 'ready' || from === ''}>
          Add
        </button>
      </form>
      {error !== null && (
        <p role="alert" className="settings-over-time__error">
          {error}
        </p>
      )}
      <p role="status" className="settings-over-time__status secondary">
        {state === 'loading' && 'Loading your settings…'}
        {state === 'failed' &&
          'Your dated settings could not be loaded. Reload the page to try again.'}
        {state === 'ready' && status}
      </p>
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="settings-over-time__table">
            <caption>Your dated settings</caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">From</th>
                <th scope="col" className="num">
                  Value
                </th>
                <th scope="col">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const label = settingLabel(entry.kind, entry.sport)
                return (
                  <tr key={measurementKey(entry)}>
                    <td>{label}</td>
                    <td>{dayText(entry.from)}</td>
                    <td className="num">{displaySetting(entry.kind, entry.value, units)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn settings-over-time__delete"
                        disabled={busy}
                        aria-label={`Delete ${label.toLowerCase()} from ${dayText(entry.from)}`}
                        onClick={() => void remove(entry)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && state === 'ready' && (
        <p className="secondary">
          No dated settings yet. The app uses your current weight and its own estimates.
        </p>
      )}
    </section>
  )
}
