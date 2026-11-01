import { DEFAULT_PERIOD_DAYS, DEFAULT_PERIOD_WEEKS } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'

/** A stretch of time by its first and last millisecond; null when it has no dates. */
export interface Span {
  startMs: number | null
  endMs: number | null
}
import { formatSpan } from '../format/date'
import { plural } from './plural'

export interface RangeOption {
  /** The control's value for the choice. */
  value: string
  /** Button text in the period control. */
  label: string
  /** The text a narrow phone shows instead; `label` stays the accessible name. */
  short: string
  choice: PeriodChoice
}

/** The period lengths, in days. Named once: the control, its labels and the tests read these. */
export const SIX_WEEKS_DAYS = 42
export const HALF_YEAR_DAYS = 182
export const ONE_YEAR_DAYS = 365

/** The words for the lengths, named once: the control's labels and the "Previous ..." labels share them. */
const SIX_WEEKS_LABEL = '6 weeks'
const TWELVE_WEEKS_LABEL = `${DEFAULT_PERIOD_WEEKS} weeks`
const HALF_YEAR_LABEL = '26 weeks'
const ONE_YEAR_LABEL = '12 months'

/**
 * The periods the control offers, shortest first. Every period counts back from the newest activity. Each is the length it
 * names: 12 weeks is exactly 12 weeks, picked by the athlete. The default is not one of them: it is the window the search
 * settles on (`resolveWindow`), shown by the segment of the same length, or by none where there is no such segment (26 weeks).
 */
export const RANGE_OPTIONS: RangeOption[] = [
  { value: String(SIX_WEEKS_DAYS), label: SIX_WEEKS_LABEL, short: '6 wk', choice: SIX_WEEKS_DAYS },
  {
    value: String(DEFAULT_PERIOD_DAYS),
    label: TWELVE_WEEKS_LABEL,
    short: '12 wk',
    choice: DEFAULT_PERIOD_DAYS,
  },
  { value: String(ONE_YEAR_DAYS), label: ONE_YEAR_LABEL, short: '12 mo', choice: ONE_YEAR_DAYS },
  { value: 'all', label: 'All time', short: 'All', choice: 'all' },
]

/** The periods the activity list offers. It shows the whole library until one is picked, and has no 12 weeks of its own. */
export const LIBRARY_RANGE_OPTIONS = RANGE_OPTIONS.filter(
  (option) => option.choice !== DEFAULT_PERIOD_DAYS,
)

/**
 * The Custom segment. It picks a range the athlete enters rather than a fixed period, so it has no
 * choice of its own: a custom range's value is this one too.
 */
export const CUSTOM_OPTION: Pick<RangeOption, 'value' | 'label'> & { short?: undefined } = {
  value: 'custom',
  label: 'Custom',
}

export function optionValue(choice: PeriodChoice): string {
  if (typeof choice === 'object') return CUSTOM_OPTION.value
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
export function lengthOf(days: number): string {
  if (days === SIX_WEEKS_DAYS) return SIX_WEEKS_LABEL
  if (days === DEFAULT_PERIOD_DAYS) return TWELVE_WEEKS_LABEL
  if (days === HALF_YEAR_DAYS) return HALF_YEAR_LABEL
  if (days === ONE_YEAR_DAYS) return ONE_YEAR_LABEL
  return plural(days, 'day')
}

/** The period on screen as a name: "12 weeks", "6 weeks", "All time", or a custom range's days. */
export function periodName(days: number | null): string {
  return days === null ? 'All time' : lengthOf(days)
}

/** The label of the period before the one selected, or null when there is none (all time). */
export function previousPeriodLabel(days: number | null): string | null {
  return days === null ? null : `Previous ${lengthOf(days)}`
}
