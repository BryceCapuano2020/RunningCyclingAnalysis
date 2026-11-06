import { useRef } from 'react'
import type { ReactNode } from 'react'
import { CustomRangeForm } from './CustomRangeForm'
import { PeriodStatus } from './PeriodCaption'
import { periodRows } from './periodCaptionWords'
import { NO_ROWS } from './property'
import type { Property } from './property'
import type { PeriodCaptionProps } from './periodCaptionWords'
import { WAITS_FOR_IMPORT } from './RangePicker'
import type { RangePickerProps } from './RangePicker'
import { CUSTOM_OPTION, RANGE_OPTIONS, choiceOfValue, optionValue } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import { usePeriodPicks } from './usePeriodPicks'

export type PeriodRailProps = Omit<RangePickerProps, 'options' | 'custom' | 'compact'> & {
  /** The note as detail-panel rows, one fact each, for a page whose Details are rows. */
  noteRows?: readonly Property[]
}

export interface PeriodRail {
  /** The periods as the rail's words: the group named Period, one radio for each, then Custom. */
  periods: ReactNode
  /** Under the page title: the status a screen reader hears when the period changes, and the Custom form while it is open. */
  caption: ReactNode
  /** The dates, the counts and the notes as a detail panel's rows, for the page's Details. */
  rows: Property[]
}

/** The row said while a pick waits behind an import. */
const WAITING_ROW: Property = { label: 'Period change', value: WAITS_FOR_IMPORT }

/**
 * The period control set out of the page: the choices in the rail, and what they say: a status under the page's title
 * and one meta line the page puts in its Details (docs/design/system.md, No subtitle lines). All read one state, so a
 * pick in the rail moves the line, and Custom in the rail opens its form under the title.
 */
export function usePeriodRail({
  choice,
  resolved,
  range = null,
  dates = '',
  noteRows = NO_ROWS,
  shown,
  total,
  notCounted = 0,
  noun = 'activity',
  countHref,
  notCountedHref,
  busy = false,
  onChange,
}: PeriodRailProps): PeriodRail {
  const root = useRef<HTMLDivElement>(null)
  const { picked, checked, waiting, customOpen, openCustom, swapped, pick } = usePeriodPicks({
    choice,
    resolved,
    root,
    onChange,
  })
  const offered = [...RANGE_OPTIONS, CUSTOM_OPTION]
  const choiceLabel = offered.find((option) => option.value === optionValue(checked))?.label
  const shownValue = customOpen ? CUSTOM_OPTION.value : optionValue(checked)
  const periods = (
    <div className="period-rail" ref={root}>
      <SegmentedControl
        legend="Period"
        legendHidden
        variant="text"
        // Below the rail's width the periods take their short names; the full name stays each one's accessible name.
        options={offered.map(({ value, label, short }) => ({ value, label, short }))}
        selected={shownValue}
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
    </div>
  )
  const words: PeriodCaptionProps = {
    className: 'meta period-caption__line',
    dates,
    shown,
    total,
    notCounted,
    noun,
    countHref,
    notCountedHref,
    swapped,
    // The note (why the window was chosen, how old the newest activity is) is a line of its own in the Details.
    inlineNote: null,
    choiceLabel,
  }
  const caption = (
    <div className="period-caption">
      <PeriodStatus {...words} />
      {customOpen && (
        <CustomRangeForm range={range} onApply={(next, reversed) => pick(next, reversed)} />
      )}
    </div>
  )
  return {
    periods,
    caption,
    rows: periodRows(words, waiting && busy ? [WAITING_ROW] : noteRows),
  }
}
