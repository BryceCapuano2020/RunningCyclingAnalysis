import { DEFAULT_PERIOD_DAYS, DEFAULT_PERIOD_WEEKS } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'

/** A stretch of time by its first and last millisecond; null when it has no dates. */
export interface Span {
  startMs: number | null
  endMs: number | null
}
import { formatSpan } from '../format/date'

export interface RangeOption {
  /** The control's value for the choice. */
  value: string
  /** Button text in the period control. */
  label: string
  choice: PeriodChoice
}

/** The period lengths, in days. Named once: the control, its labels and the tests read these. */
export const SIX_WEEKS_DAYS = 42
export const THREE_MONTHS_DAYS = 91
export const ONE_YEAR_DAYS = 365

export const RANGE_OPTIONS: RangeOption[] = [
  { value: 'default', label: 'Default', choice: 'default' },
  { value: String(SIX_WEEKS_DAYS), label: '6 weeks', choice: SIX_WEEKS_DAYS },
  { value: String(THREE_MONTHS_DAYS), label: '3 months', choice: THREE_MONTHS_DAYS },
  { value: String(ONE_YEAR_DAYS), label: '1 year', choice: ONE_YEAR_DAYS },
  { value: 'all', label: 'All time', choice: 'all' },
]

/** The periods the activity list offers. It shows the whole library until one is picked. */
export const LIBRARY_RANGE_OPTIONS = RANGE_OPTIONS.filter((option) => option.choice !== 'default')

export function optionValue(choice: PeriodChoice): string {
  return choice === 'default' || choice === 'all' ? choice : String(choice)
}

export function choiceOfValue(value: string): PeriodChoice | undefined {
  return RANGE_OPTIONS.find((option) => option.value === value)?.choice
}

/** The period's dates, such as "12 May – 3 Aug 2025"; empty for a library with no activities. */
export function periodDates(span: Span): string {
  if (span.startMs === null || span.endMs === null) return ''
  return formatSpan(span.startMs, span.endMs)
}

/** A length in words for the named periods, and in days for any other. */
function lengthOf(days: number): string {
  if (days === SIX_WEEKS_DAYS) return '6 weeks'
  if (days === DEFAULT_PERIOD_DAYS) return `${DEFAULT_PERIOD_WEEKS} weeks`
  if (days === THREE_MONTHS_DAYS) return '3 months'
  if (days === ONE_YEAR_DAYS) return 'year'
  return `${days} days`
}

/** Why the default shows all time, under the period's dates. */
export const FALLBACK_NOTE = `The ${DEFAULT_PERIOD_WEEKS} weeks up to your newest activity do not hold both a run and a ride, so this shows all time.`

/** The label of the period before the one selected, or null when there is none (all time). */
export function previousPeriodLabel(days: number | null): string | null {
  return days === null ? null : `Previous ${lengthOf(days)}`
}

/**
 * Where a figure's numbers come from, as the phrase after "Based on" or "No runs":
 * "in this period" when a window is set, and "in all your files" under All time, which has no period.
 */
export function scopeText(rangeDays: number | null): string {
  return rangeDays === null ? 'in all your files' : 'in this period'
}
