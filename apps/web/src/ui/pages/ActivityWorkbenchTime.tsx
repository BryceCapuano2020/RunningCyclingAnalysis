import { useId, useState } from 'react'
import { formatRecordTime, formatTotalTime } from '@rca/core/units'
import { parseClockTime } from './workbenchTime'
import type { Selection } from './workbenchTime'

/** The selected interval, as a slider and a typed time for each end. */
export function TimeSelection({
  max,
  selection,
  onChange,
}: {
  max: number
  selection: Selection
  onChange: (selection: Selection) => void
}) {
  const { startS, endS } = selection
  return (
    <fieldset className="activity-workbench__selection">
      <legend>Selected interval</legend>
      <div className="activity-workbench__range">
        <TimeField
          label="Start time"
          value={startS}
          min={0}
          max={endS - 1}
          track={max}
          onCommit={(value) => onChange({ startS: value, endS })}
        />
        <TimeField
          label="End time"
          value={endS}
          min={startS + 1}
          max={max}
          track={max}
          onCommit={(value) => onChange({ startS, endS: value })}
        />
      </div>
    </fieldset>
  )
}

/**
 * One end of the interval. The slider moves it by the second. The typed time is a draft until Enter or
 * leaving the field, so a time still being typed is never snapped to its bounds on the way.
 */
function TimeField({
  label,
  value,
  min,
  max,
  track,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  track: number
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
      <span className="activity-workbench__input-row">
        <input
          type="range"
          min={0}
          max={track}
          value={value}
          aria-label={`${label} slider`}
          aria-valuetext={formatTotalTime(value)}
          onChange={(event) =>
            onCommit(Math.max(min, Math.min(event.currentTarget.valueAsNumber, max)))
          }
        />
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
      </span>
      {refused && (
        <p id={`${id}-error`} className="activity-workbench__error" role="alert">
          Enter a time from {formatRecordTime(min)} to {formatRecordTime(max)}, such as 12:30.
        </p>
      )}
    </div>
  )
}
