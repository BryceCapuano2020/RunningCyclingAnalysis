import { useRef } from 'react'
import type { ReactNode } from 'react'
import { CustomRangeForm } from './CustomRangeForm'
import { PeriodCaption } from './PeriodCaption'
import { WAITS_FOR_IMPORT } from './RangePicker'
import type { RangePickerProps } from './RangePicker'
import { CUSTOM_OPTION, RANGE_OPTIONS, choiceOfValue, optionValue } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import { usePeriodPicks } from './usePeriodPicks'

export type PeriodRailProps = Omit<RangePickerProps, 'options' | 'custom' | 'compact'>

export interface PeriodRail {
  /** The periods as the rail's words: the group named Period, one radio for each, then Custom. */
  periods: ReactNode
  /** Under the page title: the dates, the count and the note as one meta line, and the Custom form while it is open. */
  caption: ReactNode
}

/**
 * The period control set out of the page: the choices in the rail and what they say under the page's title. Both
 * read one state, so a pick in the rail moves the caption, and Custom in the rail opens its form under the title.
 */
export function usePeriodRail({
  choice,
  resolved,
  range = null,
  dates = '',
  note,
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
  const noteText = waiting && busy ? WAITS_FOR_IMPORT : note
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
  const caption = (
    <div className="period-caption">
      <PeriodCaption
        className="meta period-caption__line"
        dates={dates}
        shown={shown}
        total={total}
        notCounted={notCounted}
        noun={noun}
        countHref={countHref}
        notCountedHref={notCountedHref}
        swapped={swapped}
        inlineNote={noteText ? noteText : null}
        choiceLabel={choiceLabel}
      />
      {customOpen && (
        <CustomRangeForm range={range} onApply={(next, reversed) => pick(next, reversed)} />
      )}
    </div>
  )
  return { periods, caption }
}
