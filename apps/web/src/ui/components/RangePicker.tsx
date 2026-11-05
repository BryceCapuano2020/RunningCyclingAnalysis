import { useRef } from 'react'
import type { ReactNode } from 'react'
import type { CustomRange } from '@rca/core/customRange'
import type { PeriodChoice } from '@rca/core/period'
import { CustomRangeForm } from './CustomRangeForm'
import { PeriodCaption, PeriodCaptionLine, PeriodStatus } from './PeriodCaption'
import type { PeriodCaptionProps } from './PeriodCaption'
import { NOUNS } from './periodNouns'
import { CUSTOM_OPTION, RANGE_OPTIONS, choiceOfValue, optionValue } from './rangeOptions'
import type { RangeOption } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import { usePeriodPicks } from './usePeriodPicks'
import './RangePicker.css'

export { SWAPPED_NOTE } from './periodNouns'

/** Shown while a pick waits behind an import: the worker answers it only once the import finishes. */
export const WAITS_FOR_IMPORT = 'Applies when the current import finishes'

export interface RangePickerProps {
  /** The choice on screen, unless the athlete has picked one here since. */
  choice: PeriodChoice
  /**
   * The window the default stands for, once the default has been resolved. On the default the control selects the segment
   * of that window, the period in force, and none before it is resolved. Ignored for any other choice.
   */
  resolved?: PeriodChoice
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
  /** How many of the total are in the period, whether or not the analysis counts them. */
  shown: number
  /** How many are on file: every activity of the kind counted, whether or not the analysis reads it. */
  total: number
  /** Of the total, how many the analysis does not count. Said once, after the count, with a link to them. */
  notCounted?: number
  /** What is counted; the activities unless a sport page says otherwise. */
  noun?: keyof typeof NOUNS
  /**
   * The compact form Balance sets under its levels: the legend hidden (the group is still named), the chips
   * tight, and the dates, the count and the note on one line under them.
   */
  compact?: boolean
  /** The caption behind one Details, with this first inside it: a page that keeps its counts and dates off its face. */
  foldedLead?: ReactNode
  /** Where the count links to, such as the activity list that holds them. */
  countHref?: string
  /** Where "not counted" links to: the activities left out, with the reason on each. */
  notCountedHref?: string
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
  resolved,
  options = RANGE_OPTIONS,
  custom = false,
  range = null,
  dates = '',
  note,
  shown,
  total,
  notCounted = 0,
  noun = 'activity',
  compact = false,
  foldedLead,
  countHref,
  notCountedHref,
  busy = false,
  onChange,
}: RangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { picked, checked, waiting, customOpen, openCustom, swapped, pick } = usePeriodPicks({
    choice,
    resolved,
    root: rootRef,
    onChange,
  })
  const offered = custom ? [...options, CUSTOM_OPTION] : options
  const choiceLabel = offered.find((option) => option.value === optionValue(checked))?.label
  // While a pick waits for an import, the note says so instead of the page's note.
  const noteText = waiting && busy ? WAITS_FOR_IMPORT : note
  const caption: PeriodCaptionProps = {
    className: 'range-picker__caption muted',
    dates,
    shown,
    total,
    notCounted,
    noun,
    countHref,
    notCountedHref,
    swapped,
    inlineNote: compact && noteText ? noteText : null,
    choiceLabel,
  }
  return (
    <div className={compact ? 'range-picker range-picker--compact' : 'range-picker'} ref={rootRef}>
      <SegmentedControl
        legend="Period"
        legendHidden={compact}
        options={offered.map(({ value, label, short }) => ({ value, label, short }))}
        selected={customOpen ? CUSTOM_OPTION.value : optionValue(checked)}
        onReselect={(value) => {
          // The segment of a resolved default is checked without being a pick, so clicking it makes the pick.
          const next = picked === 'default' ? choiceOfValue(value) : undefined
          if (next !== undefined) pick(next)
        }}
        onSelect={(value) => {
          if (value === CUSTOM_OPTION.value) {
            openCustom(true)
            return
          }
          const next = choiceOfValue(value)
          if (next === undefined) return
          openCustom(false)
          pick(next)
        }}
      />
      {custom && customOpen && (
        <CustomRangeForm range={range} onApply={(next, reversed) => pick(next, reversed)} />
      )}
      {foldedLead === undefined ? (
        <PeriodCaption {...caption} />
      ) : (
        <>
          <details className="disclosure">
            <summary>Details</summary>
            <div className="disclosure__body">
              {foldedLead}
              <PeriodCaptionLine {...caption} />
            </div>
          </details>
          <PeriodStatus {...caption} />
        </>
      )}
      {noteText && !compact && <p className="range-picker__note muted">{noteText}</p>}
    </div>
  )
}
