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

/** Shown after a reversed range is applied: its days are taken in order, so the caption dates them right. */
export const SWAPPED_NOTE = 'Swapped so From comes first.'

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
  /**
   * The compact form Balance sets under its levels: the legend hidden (the group is still named), the chips
   * tight, and the dates, the count and the note on one line under them.
   */
  compact?: boolean
  /** Where the count links to, such as the activity list that holds them. */
  countHref?: string
  /** What the count leaves out, such as "(38 walking-pace runs left out)", said after it. */
  leftOut?: string
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
  compact = false,
  countHref,
  leftOut,
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
  // Whether the range on screen was swapped on Apply. A fixed period is not a swap, so it clears the note.
  const [swapped, setSwapped] = useState(false)
  if (!sameChoice(choice, seenChoice)) {
    setSeenChoice(choice)
    setCustomOpen(isCustomChoice(choice))
    if (!isCustomChoice(choice)) setSwapped(false)
  }
  const offered = custom ? [...options, CUSTOM_OPTION] : options
  const [singular, pluralForm] = NOUNS[noun]
  const totalPhrase = plural(total, singular, pluralForm)
  // All of them need no count, unless something is said to be left out of it: then it says how many it is.
  const count =
    shown < total
      ? `${formatCount(shown)} of ${totalPhrase}`
      : leftOut === undefined
        ? ''
        : totalPhrase
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
  const announcement = [counted, choiceLabel, dates, swapped ? SWAPPED_NOTE : '']
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
  const rootRef = useRef<HTMLDivElement>(null)
  const markPick = usePickInPlace(rootRef, waiting)
  const pick = (next: PeriodChoice, reversed = false) => {
    markPick()
    setSwapped(reversed)
    const id = made.current + 1
    made.current = id
    setPicks((current) => ({ count: id, answered: current.answered, latest: next }))
    onChange(next, () =>
      setPicks((current) => ({ ...current, answered: Math.max(current.answered, id) })),
    )
  }
  return (
    <div className={compact ? 'range-picker range-picker--compact' : 'range-picker'} ref={rootRef}>
      <SegmentedControl
        legend="Period"
        legendHidden={compact}
        options={offered.map(({ value, label, short }) => ({ value, label, short }))}
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
      {custom && customOpen && (
        <CustomRangeForm range={range} onApply={(next, reversed) => pick(next, reversed)} />
      )}
      {(dates !== '' || count !== '' || swapped || (compact && noteText)) && (
        <p className="range-picker__caption muted">
          {dates !== '' && <span className="range-picker__dates">{dates}</span>}
          {dates !== '' && count !== '' && ' · '}
          {count !== '' && (
            <span className="range-picker__count">
              {countHref === undefined ? count : <a href={countHref}>{count}</a>}
              {leftOut === undefined ? null : ` ${leftOut}`}
            </span>
          )}
          {swapped && (
            <>
              {(dates !== '' || count !== '') && ' · '}
              <span className="range-picker__swapped">{SWAPPED_NOTE}</span>
            </>
          )}
          {compact && noteText ? (
            <>
              {(dates !== '' || count !== '' || swapped) && ' · '}
              <span className="range-picker__inline-note">{noteText}</span>
            </>
          ) : null}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {noteText && !compact && <p className="range-picker__note muted">{noteText}</p>}
    </div>
  )
}
