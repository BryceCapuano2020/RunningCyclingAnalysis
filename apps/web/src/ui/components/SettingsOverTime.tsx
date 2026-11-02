import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { isLocalDate, localDateOf, localDayStartMs, measurementKey } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import type { UnitSystem } from '@rca/core/units'
import { MEASUREMENT_YEARS, isMeasurementYear } from '@rca/contract'
import { messageOf } from '../../api/messageOf'
import { SPORT_ACTIVITY } from '../sports'
import { useNow } from '../useNow'
import { useScrollRegion } from '../useScrollRegion'
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
import { weightQuestion } from '../typicalWeight'
import type { WeightReference } from '../typicalWeight'
import { NumberField } from './NumberField'
import './SettingsOverTime.css'

export interface SettingsOverTimeProps {
  entries: readonly Measurement[]
  state: MeasurementsController['state']
  units: UnitSystem
  /** The weight saved on the profile, kg, which a dated weight is set against when no dated one is near. */
  weightKg?: number | null
  /** Resolves once the entry is kept. Rejects with the reason when it is not. */
  onAdd: (entry: Measurement) => Promise<unknown>
  onRemove: (entry: Measurement) => Promise<unknown>
  /** Dated settings this browser holds from before signing in, which the account does not. */
  elsewhere?: number
  /** Loads the account's settings again, offered as Try again when they could not be loaded. */
  retry?: () => void
  /**
   * Opens the form to a setting with a value typed in, as the Set control beside an estimated max heart rate asks.
   * Each request has its own `nonce`, so asking twice for the same setting works again.
   */
  prefill?: SettingPrefill | null
}

export interface SettingPrefill {
  /** The setting, as `SETTING_CHOICES` ids it, such as `maxHeartRate.run`. */
  choiceId: string
  text: string
  nonce: number
}

const FIRST_CHOICE = SETTING_CHOICES[0] as SettingChoice

/** The list's order: one setting after another, and within each the latest date first. */
function listOrder(a: Measurement, b: Measurement): number {
  return settingOrder(a) - settingOrder(b) || (a.from < b.from ? 1 : a.from > b.from ? -1 : 0)
}

function dayText(date: string): string {
  return formatDay(localDayStartMs(date))
}

/** The earlier weight a new dated one is set against: the dated weight nearest its date, else the profile's. */
function weightReference(
  entries: readonly Measurement[],
  from: string,
  profileKg: number | null,
): WeightReference | null {
  const near = entries
    .filter((entry) => entry.kind === 'massKg' && entry.from !== from)
    .sort(
      (a, b) =>
        Math.abs(localDayStartMs(a.from) - localDayStartMs(from)) -
        Math.abs(localDayStartMs(b.from) - localDayStartMs(from)),
    )[0]
  if (near !== undefined) return { kg: near.value, label: `your weight from ${dayText(near.from)}` }
  return profileKg === null ? null : { kg: profileKg, label: 'your saved weight' }
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
  weightKg = null,
  onAdd,
  onRemove,
  elsewhere = 0,
  retry,
  prefill = null,
}: SettingsOverTimeProps) {
  const baseId = useId()
  // At 320 px the table is wider than the page, so it scrolls and a keyboard reader can reach it.
  const tableRegion = useScrollRegion('Your dated settings')
  const [choiceId, setChoiceId] = useState(FIRST_CHOICE.id)
  const [text, setText] = useState('')
  // The date the athlete picked. Until one is picked the form starts from today, and rolls over at midnight.
  const [picked, setPicked] = useState<string | null>(null)
  const now = useNow()
  const from = picked ?? localDateOf(now)
  // Why the value or the date typed cannot be used, each shown beside its own field, and why the
  // entry was refused when both were fine.
  const [valueError, setValueError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  // The entry the athlete was asked about and has not answered, as setting, value and date. Add again answers it.
  const [asked, setAsked] = useState<string | null>(null)
  const appliedNonce = useRef<number | null>(null)
  const focusedNonce = useRef<number | null>(null)
  // A request to set a figure opens the form to it, with the figure typed in for the athlete to confirm or change. The
  // form is in view at once, with the status line saying whether the settings are loading or could not be loaded; the
  // field takes focus once they are ready.
  useEffect(() => {
    if (prefill === null) return
    if (appliedNonce.current !== prefill.nonce) {
      appliedNonce.current = prefill.nonce
      setChoiceId(prefill.choiceId)
      setText(prefill.text)
      setValueError(null)
      setDateError(null)
      setRefusal(null)
      document.getElementById(`${baseId}-title`)?.scrollIntoView?.({ block: 'start' })
    }
    if (state === 'ready' && focusedNonce.current !== prefill.nonce) {
      focusedNonce.current = prefill.nonce
      document.getElementById(`${baseId}-value`)?.focus()
    }
  }, [prefill, state, baseId])
  const choice = SETTING_CHOICES.find((option) => option.id === choiceId) ?? FIRST_CHOICE
  const rows = [...entries].sort(listOrder)
  const dateOk = isLocalDate(from) && isMeasurementYear(from)
  const unit = settingUnit(choice.kind, units)

  function clearErrors() {
    setAsked(null)
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
    // A body weight that is out of the typical range, or far from the one before, is asked about first.
    // Pressing Add again with the same setting, value and date answers the question.
    const answer = `${choice.id}|${reading.value}|${from}`
    const question =
      choice.kind === 'massKg'
        ? weightQuestion(reading.value, text, units, weightReference(entries, from, weightKg))
        : null
    if (question !== null && asked !== answer) {
      setAsked(answer)
      setValueError(`${question} Check the units, or press Add again to keep it.`)
      return
    }
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
      <p className="secondary">Add dated values. Each activity uses the value from its day.</p>
      <form className="settings-over-time__form" onSubmit={(event) => void add(event)}>
        <div className="settings-over-time__field">
          {/* Its own label, since a label that wrapped the select would be named by every option. */}
          <label htmlFor={`${baseId}-choice`}>Setting</label>
          <select
            id={`${baseId}-choice`}
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
        </div>
        {/* Names the setting for the value field, which is labelled by its unit alone. */}
        <span id={`${baseId}-setting`} className="sr-only">
          {choice.label}
        </span>
        <NumberField
          id={`${baseId}-value`}
          label={`Value (${unit})`}
          aria-describedby={`${baseId}-setting`}
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
                setPicked(event.target.value)
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
        {state === 'failed' && 'Your dated settings could not be loaded.'}
        {state === 'ready' && status}
      </p>
      {state === 'failed' && retry !== undefined && (
        <div>
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="table-scroll" {...tableRegion}>
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
                        aria-label={`Delete ${displaySetting(entry.kind, entry.value, units)}${entry.sport === undefined ? '' : ` (${SPORT_ACTIVITY[entry.sport]})`} from ${dayText(entry.from)}`}
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
