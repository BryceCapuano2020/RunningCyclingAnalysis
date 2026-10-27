import { useState } from 'react'
import type { FormEvent } from 'react'
import { isCustomChoice, orderedRange } from '@rca/core/customRange'
import type { CustomRange } from '@rca/core/customRange'

/** Shown when a typed date is one the period cannot be dated from, such as a year before 0100. */
export const UNUSABLE_DATES = 'Pick dates from the year 100 on.'

export interface CustomRangeFormProps {
  /** The first and last day on screen, which the two fields start from. Null when there are none. */
  range: CustomRange | null
  /** Called once, with the days in order, when the athlete presses Apply. `reversed` says they were swapped. */
  onApply: (range: CustomRange, reversed: boolean) => void
}

/**
 * The From and To days of a Custom period. The range applies on Apply, so a date typed on the way is
 * not counted until the athlete has finished with both. Apply waits for a range the core accepts, so
 * the page never stores one the worker would refuse.
 */
export function CustomRangeForm({ range, onApply }: CustomRangeFormProps) {
  const [from, setFrom] = useState(range?.from ?? '')
  const [to, setTo] = useState(range?.to ?? '')
  const ready = isCustomChoice({ from, to })
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready) return
    const ordered = orderedRange({ from, to })
    setFrom(ordered.from)
    setTo(ordered.to)
    onApply(ordered, ordered.from !== from)
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
      <button type="submit" className="btn range-picker__apply" disabled={!ready}>
        Apply
      </button>
      {from !== '' && to !== '' && !ready && <p className="range-picker__hint">{UNUSABLE_DATES}</p>}
    </form>
  )
}
