export interface RangeOption {
  value: string
  /** Button text in the period control. */
  label: string
  /** Days back from the latest activity, or null for all time. */
  days: number | null
  /** The period as a phrase, e.g. on the share card. */
  period: string
}

export const RANGE_OPTIONS: RangeOption[] = [
  { value: '42', label: '6 weeks', days: 42, period: 'Last 6 weeks' },
  { value: '91', label: '3 months', days: 91, period: 'Last 3 months' },
  { value: '365', label: '1 year', days: 365, period: 'Last year' },
  { value: 'all', label: 'All time', days: null, period: 'All time' },
]

/** The period as a phrase for a range in days, or null for all time. */
export function rangePeriod(rangeDays: number | null): string {
  const option = RANGE_OPTIONS.find((candidate) => candidate.days === rangeDays)
  if (option) return option.period
  return rangeDays === null ? 'All time' : `Last ${rangeDays} days`
}
