import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { isLocalDate, localDateOf, localDayStartMs, measurementKey } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import type { UnitSystem } from '@rca/core/units'
import { MEASUREMENT_YEARS } from '@rca/contract'
import { messageOf } from '../../api/messageOf'
import { plural } from './plural'
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
  /** Dated settings this browser holds from before signing in, which the account does not. */
  elsewhere?: number
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
  elsewhere = 0,
}: SettingsOverTimeProps) {
  const baseId = useId()
  const [choiceId, setChoiceId] = useState(FIRST_CHOICE.id)
  const [text, setText] = useState('')
  const [from, setFrom] = useState(() => localDateOf(Date.now()))
  // Why the value or the date typed cannot be used, each shown beside its own field, and why the
  // entry was refused when both were fine.
  const [valueError, setValueError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const choice = SETTING_CHOICES.find((option) => option.id === choiceId) ?? FIRST_CHOICE
  const rows = [...entries].sort(listOrder)
  const dateOk =
    isLocalDate(from) &&
    Number(from.slice(0, 4)) >= MEASUREMENT_YEARS.min &&
    Number(from.slice(0, 4)) <= MEASUREMENT_YEARS.max
  const unit = settingUnit(choice.kind, units)

  function clearErrors() {
    setValueError(null)
    setDateError(null)
    setRefusal(null)
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const reading = readSetting(choice.kind, text, units)
    const badDate = dateOk
      ? null
      : `Pick a date from ${MEASUREMENT_YEARS.min} to ${MEASUREMENT_YEARS.max}`
    // Both are checked, so a wrong value and a wrong date are each said at once.
    setValueError('error' in reading ? reading.error : null)
    setDateError(badDate)
    if ('error' in reading || badDate !== null) return
    const entry: Measurement = {
      kind: choice.kind,
      ...(choice.sport === undefined ? {} : { sport: choice.sport }),
      value: reading.value,
      from,
    }
    const replaces = entries.some((held) => measurementKey(held) === measurementKey(entry))
    setBusy(true)
    setRefusal(null)
    setStatus('')
    try {
      await onAdd(entry)
      setText('')
      setStatus(
        `${replaces ? 'Updated' : 'Added'} ${choice.label.toLowerCase()} from ${dayText(from)}.`,
      )
    } catch (failure) {
      setRefusal(messageOf(failure))
    }
    setBusy(false)
  }

  async function remove(entry: Measurement) {
    if (busy) return
    setBusy(true)
    setRefusal(null)
    setStatus('')
    try {
      await onRemove(entry)
      setStatus(
        `Deleted ${settingLabel(entry.kind, entry.sport).toLowerCase()} from ${dayText(entry.from)}.`,
      )
    } catch (failure) {
      setRefusal(messageOf(failure))
    }
    setBusy(false)
  }

  return (
    <section className="section settings-over-time" aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>Settings over time</h2>
      <p className="secondary">
        Date a weight, a max heart rate or a threshold. Each activity uses the setting in effect on
        its own day, so a ride from last year uses last year’s weight. Before your first entry your
        earliest one applies. With none, ride results use your current weight, and thresholds and
        zones are estimated from your activities.
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
              clearErrors()
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
          label={`${choice.label}, ${unit}`}
          unit={unit}
          inputMode={choice.kind === 'thresholdPace' ? 'text' : 'decimal'}
          autoComplete="off"
          enterKeyHint="done"
          disabled={state !== 'ready'}
          value={text}
          error={valueError}
          onChange={(event) => {
            clearErrors()
            setText(event.target.value)
          }}
        />
        <div className="settings-over-time__date">
          <label className="settings-over-time__field">
            <span>From</span>
            <input
              type="date"
              value={from}
              min={`${MEASUREMENT_YEARS.min}-01-01`}
              max={`${MEASUREMENT_YEARS.max}-12-31`}
              disabled={state !== 'ready'}
              aria-invalid={dateError === null ? undefined : true}
              aria-describedby={dateError === null ? undefined : `${baseId}-date-error`}
              onChange={(event) => {
                clearErrors()
                setFrom(event.target.value)
              }}
            />
          </label>
          {dateError !== null && (
            <span id={`${baseId}-date-error`} role="alert" className="settings-over-time__error">
              {dateError}
            </span>
          )}
        </div>
        <button type="submit" className="btn" disabled={busy || state !== 'ready'}>
          Add
        </button>
      </form>
      {refusal !== null && (
        <p role="alert" className="settings-over-time__error">
          {refusal}
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
      {elsewhere > 0 && (
        <p className="secondary">
          {`This browser also holds ${plural(elsewhere, 'dated setting', 'dated settings')} from before you signed in. ${elsewhere === 1 ? 'It is' : 'They are'} not part of your account, and ${elsewhere === 1 ? 'is' : 'are'} not used while you are signed in.`}
        </p>
      )}
      {rows.length === 0 && state === 'ready' && (
        <p className="secondary">
          No dated settings yet. The app uses your current weight and its own estimates.
        </p>
      )}
    </section>
  )
}
