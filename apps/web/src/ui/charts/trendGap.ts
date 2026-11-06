import type { QuietGap } from '@rca/core/digest/trendSeries'
import { formatSpan } from '../format/date'
import { utcDayLocal } from './trendTicks'

/** The dates a gap in the time axis skips, such as "3 Dec 2019 to 17 Aug 2025". */
export function gapSpanText(gap: QuietGap): string {
  return formatSpan(utcDayLocal(gap.fromMs), utcDayLocal(gap.toMs)).replace(' – ', ' to ')
}
