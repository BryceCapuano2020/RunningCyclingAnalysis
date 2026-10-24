export interface RangeOption {
  value: string
  /** Button text in the period control. */
  label: string
  /** Days back from the latest activity, or null for all time. */
  days: number | null
  /** The period as a phrase, e.g. on the share card. */
  period: string
  /** The period before it, of the same length, as a label on a chart. */
  previous: string | null
}

/** The period lengths, in days. Named once: the picker, its labels and the period tests read these. */
export const SIX_WEEKS_DAYS = 42
export const THREE_MONTHS_DAYS = 91
export const ONE_YEAR_DAYS = 365

export const RANGE_OPTIONS: RangeOption[] = [
  {
    value: String(SIX_WEEKS_DAYS),
    label: '6 weeks',
    days: SIX_WEEKS_DAYS,
    period: 'Last 6 weeks',
    previous: 'Previous 6 weeks',
  },
  {
    value: String(THREE_MONTHS_DAYS),
    label: '3 months',
    days: THREE_MONTHS_DAYS,
    period: 'Last 3 months',
    previous: 'Previous 3 months',
  },
  {
    value: String(ONE_YEAR_DAYS),
    label: '1 year',
    days: ONE_YEAR_DAYS,
    period: 'Last year',
    previous: 'Previous year',
  },
  { value: 'all', label: 'All time', days: null, period: 'All time', previous: null },
]

/** The period as a phrase for a range in days, or null for all time. */
export function rangePeriod(rangeDays: number | null): string {
  const option = RANGE_OPTIONS.find((candidate) => candidate.days === rangeDays)
  if (option) return option.period
  return rangeDays === null ? 'All time' : `Last ${rangeDays} days`
}

/** The label of the period before the one selected, or null when there is none (all time). */
export function previousPeriodLabel(rangeDays: number | null): string | null {
  if (rangeDays === null) return null
  const option = RANGE_OPTIONS.find((candidate) => candidate.days === rangeDays)
  return option ? option.previous : `Previous ${rangeDays} days`
}
