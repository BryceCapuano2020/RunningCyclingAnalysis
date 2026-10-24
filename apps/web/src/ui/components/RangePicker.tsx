import { useRef, useState } from 'react'
import type { PeriodChoice } from '@rca/core/period'
import { plural } from './plural'
import { RANGE_OPTIONS, choiceOfValue, optionValue } from './rangeOptions'
import type { RangeOption } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import './RangePicker.css'

/** What is counted in the period: the activities, or one sport's, which take their own words. */
const NOUNS: Record<'activity' | 'run' | 'ride', [string, string]> = {
  activity: ['activity', 'activities'],
  run: ['run', 'runs'],
  ride: ['ride', 'rides'],
}

/** Shown while a pick waits behind an import: the worker answers it only once the import finishes. */
export const WAITS_FOR_IMPORT = 'Applies when the current import finishes'

export interface RangePickerProps {
  /** The choice on screen, unless the athlete has picked one here since. */
  choice: PeriodChoice
  /** The periods offered. The Balance and sport pages offer all of them, the activity list fewer. */
  options?: RangeOption[]
  /** The period's dates, such as "12 May – 3 Aug 2025". Empty when there is nothing to date. */
  dates?: string
  /** A sentence under the dates, such as why the default shows all time. */
  note?: string
  /** How many of the total are in the period. */
  shown: number
  total: number
  /** What is counted; the activities unless a sport page says otherwise. */
  noun?: keyof typeof NOUNS
  /** An import is running, so a pick waits for it and says so. */
  busy?: boolean
  /**
   * Called with each pick and its own answer: the page calls `answered` once the worker has answered
   * the pick, so the control knows which picks are still waiting.
   */
  onChange: (choice: PeriodChoice, answered: (reply: unknown) => void) => void
}

/**
 * The period control: a row of segments, and beneath it the dates and the count of what is in the
 * period, then a note. Each keeps its line, so nothing moves when it fills. The control shows the
 * pick the athlete made last, so a worker answer to an earlier pick cannot move it back.
 */
export function RangePicker({
  choice,
  options = RANGE_OPTIONS,
  dates = '',
  note,
  shown,
  total,
  noun = 'activity',
  busy = false,
  onChange,
}: RangePickerProps) {
  // Each pick is numbered, and its answer marks that number as answered. The worker answers the picks in
  // the order they were made, so the control shows the latest pick until every pick is answered, and the
  // page's choice after that. An answer to an earlier pick cannot move it, whatever choice it reads.
  const made = useRef(0)
  const [picks, setPicks] = useState<{
    count: number
    answered: number
    latest: PeriodChoice | null
  }>({ count: 0, answered: 0, latest: null })
  const waiting = picks.count > picks.answered
  const checked = waiting && picks.latest !== null ? picks.latest : choice
  const [singular, pluralForm] = NOUNS[noun]
  const totalPhrase = plural(total, singular, pluralForm)
  const count = shown < total ? `${shown} of ${totalPhrase}` : ''
  // Changing the period changes every number on the page, so the choice, the count and the dates are
  // announced. The region stays mounted, so the announcement is made when its text changes.
  const counted =
    total === 0
      ? `No ${pluralForm} to show`
      : shown < total
        ? `Showing ${shown} of ${totalPhrase}`
        : `Showing all ${totalPhrase}`
  const choiceLabel = options.find((option) => option.value === optionValue(checked))?.label
  const announcement = [counted, choiceLabel, dates]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
  return (
    <div className="range-picker">
      <SegmentedControl
        legend="Period"
        options={options.map(({ value, label }) => ({ value, label }))}
        selected={optionValue(checked)}
        onSelect={(value) => {
          const next = choiceOfValue(value)
          if (next === undefined) return
          const id = made.current + 1
          made.current = id
          setPicks((current) => ({ count: id, answered: current.answered, latest: next }))
          onChange(next, () =>
            setPicks((current) => ({ ...current, answered: Math.max(current.answered, id) })),
          )
        }}
      />
      <p className="range-picker__caption muted">
        {dates !== '' && <span className="range-picker__dates">{dates}</span>}
        {dates !== '' && count !== '' && ' · '}
        {count !== '' && <span className="range-picker__count">{count}</span>}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p className="range-picker__note muted">{waiting && busy ? WAITS_FOR_IMPORT : note}</p>
    </div>
  )
}
