import { useId, useState } from 'react'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { TimeBrush } from '../charts/TimeBrush'
import type { BrushOverview } from '../charts/TimeBrush'
import { parseClockTime } from './workbenchTime'
import type { Selection } from './workbenchTime'
import './ActivityWorkbenchTime.css'

/**
 * The selected interval: a brush over an overview of the whole activity, and under it a disclosure with
 * a typed time for each end, for setting a second exactly.
 */
export function TimeSelection({
  max,
  selection,
  overview,
  onChange,
}: {
  max: number
  selection: Selection
  overview: BrushOverview | null
  onChange: (selection: Selection) => void
}) {
  const { startS, endS } = selection
  const whole = startS === 0 && endS === max
  return (
    <fieldset className="activity-workbench__selection">
      <legend>Selected interval</legend>
      <TimeBrush
        max={max}
        selection={selection}
        onChange={onChange}
        overview={overview}
        spokenTime={formatTotalTime}
      />
      <div className="activity-workbench__foot">
        <details className="activity-workbench__exact">
          <summary>
            {formatRecordTime(startS)} to {formatRecordTime(endS)} · Set by time
          </summary>
          <div className="activity-workbench__range">
            <TimeField
              label="Start time"
              value={startS}
              min={0}
              max={endS - 1}
              onCommit={(value) => onChange({ startS: value, endS })}
            />
            <TimeField
              label="End time"
              value={endS}
              min={startS + 1}
              max={max}
              onCommit={(value) => onChange({ startS, endS: value })}
            />
          </div>
        </details>
        {!whole && (
          <button className="btn" type="button" onClick={() => onChange({ startS: 0, endS: max })}>
            Whole activity
          </button>
        )}
      </div>
    </fieldset>
  )
}

/**
 * One end of the interval, as a typed time. It is a draft until Enter or leaving the field, so a time
 * still being typed is never snapped to its bounds on the way.
 */
function TimeField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const parsed = draft === null ? null : parseClockTime(draft)
  const accepted = parsed !== null && parsed >= min && parsed <= max

  const finish = (leaving: boolean) => {
    if (draft === null) return
    if (accepted) onCommit(parsed)
    if (accepted || leaving) {
      setDraft(null)
      setRefused(false)
    } else setRefused(true)
  }

  return (
    <div className="activity-workbench__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        value={draft ?? formatRecordTime(value)}
        aria-invalid={refused}
        aria-describedby={refused ? `${id}-error` : undefined}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.currentTarget.value)
          setRefused(false)
        }}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          finish(false)
        }}
      />
      {refused && (
        <p id={`${id}-error`} className="activity-workbench__error" role="alert">
          Enter a time from {formatRecordTime(min)} to {formatRecordTime(max)}, such as 12:30.
        </p>
      )}
    </div>
  )
}
