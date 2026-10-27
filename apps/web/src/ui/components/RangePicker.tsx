import { useRef, useState } from 'react'
import { isCustomChoice } from '@rca/core/customRange'
import type { CustomRange } from '@rca/core/customRange'
import { sameChoice } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import { formatCount } from '../format/count'
import { plural } from './plural'
import { CustomRangeForm } from './CustomRangeForm'
import { CUSTOM_OPTION, RANGE_OPTIONS, choiceOfValue, optionValue } from './rangeOptions'
import type { RangeOption } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import { usePickInPlace } from './usePickInPlace'
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
  /** Whether the Custom segment is offered: the Balance and sport pages, not the activity list. */
  custom?: boolean
  /** The first and last day on screen, which the Custom form starts from. */
  range?: CustomRange | null
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
 * period, then a note when there is one. The dates line is left out when it has neither. The control
 * shows the pick the athlete made last, so a worker answer to an earlier pick cannot move it back.
 */
export function RangePicker({
  choice,
  options = RANGE_OPTIONS,
  custom = false,
  range = null,
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
  // The form is open while a custom range is on screen, or while the athlete has picked Custom and not
  // yet a fixed period. A fixed period on screen closes it, but a new custom range keeps it open.
  const [customOpen, setCustomOpen] = useState(() => isCustomChoice(choice))
  const [seenChoice, setSeenChoice] = useState(choice)
  if (!sameChoice(choice, seenChoice)) {
    setSeenChoice(choice)
    setCustomOpen(isCustomChoice(choice))
  }
  const offered = custom ? [...options, CUSTOM_OPTION] : options
  const [singular, pluralForm] = NOUNS[noun]
  const totalPhrase = plural(total, singular, pluralForm)
  const count = shown < total ? `${formatCount(shown)} of ${totalPhrase}` : ''
  // Changing the period changes every number on the page, so the choice, the count and the dates are
  // announced. The region stays mounted, so the announcement is made when its text changes.
  const counted =
    total === 0
      ? `No ${pluralForm} to show`
      : shown < total
        ? `Showing ${formatCount(shown)} of ${totalPhrase}`
        : `Showing all ${totalPhrase}`
  const choiceLabel = offered.find((option) => option.value === optionValue(checked))?.label
  // While a pick waits for an import, the note says so instead of the page's note.
  const noteText = waiting && busy ? WAITS_FOR_IMPORT : note
  const announcement = [counted, choiceLabel, dates]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
  const rootRef = useRef<HTMLDivElement>(null)
  const markPick = usePickInPlace(rootRef, waiting)
  const pick = (next: PeriodChoice) => {
    markPick()
    const id = made.current + 1
    made.current = id
    setPicks((current) => ({ count: id, answered: current.answered, latest: next }))
    onChange(next, () =>
      setPicks((current) => ({ ...current, answered: Math.max(current.answered, id) })),
    )
  }
  return (
    <div className="range-picker" ref={rootRef}>
      <SegmentedControl
        legend="Period"
        options={offered.map(({ value, label }) => ({ value, label }))}
        selected={customOpen ? CUSTOM_OPTION.value : optionValue(checked)}
        onSelect={(value) => {
          if (value === CUSTOM_OPTION.value) {
            setCustomOpen(true)
            return
          }
          const next = choiceOfValue(value)
          if (next === undefined) return
          setCustomOpen(false)
          pick(next)
        }}
      />
      {custom && customOpen && <CustomRangeForm range={range} onApply={pick} />}
      {(dates !== '' || count !== '') && (
        <p className="range-picker__caption muted">
          {dates !== '' && <span className="range-picker__dates">{dates}</span>}
          {dates !== '' && count !== '' && ' · '}
          {count !== '' && <span className="range-picker__count">{count}</span>}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {noteText && <p className="range-picker__note muted">{noteText}</p>}
    </div>
  )
}
