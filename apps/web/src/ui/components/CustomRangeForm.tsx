import { useState } from 'react'
import type { FormEvent } from 'react'
import { orderedRange } from '@rca/core/customRange'
import type { CustomRange } from '@rca/core/customRange'

export interface CustomRangeFormProps {
  /** The first and last day on screen, which the two fields start from. Null when there are none. */
  range: CustomRange | null
  /** Called once, with the days in order, when the athlete presses Apply. */
  onApply: (range: CustomRange) => void
}

/**
 * The From and To days of a Custom period. The range applies on Apply, so a date typed on the way is
 * not counted until the athlete has finished with both.
 */
export function CustomRangeForm({ range, onApply }: CustomRangeFormProps) {
  const [from, setFrom] = useState(range?.from ?? '')
  const [to, setTo] = useState(range?.to ?? '')
  const complete = from !== '' && to !== ''
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!complete) return
    const ordered = orderedRange({ from, to })
    setFrom(ordered.from)
    setTo(ordered.to)
    onApply(ordered)
  }
  return (
    <form className="range-picker__custom" onSubmit={apply}>
      <label className="range-picker__field">
        <span>From</span>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label className="range-picker__field">
        <span>To</span>
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <button type="submit" className="btn range-picker__apply" disabled={!complete}>
        Apply
      </button>
    </form>
  )
}
