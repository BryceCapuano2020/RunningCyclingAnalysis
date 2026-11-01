import { checkInText } from '@rca/core/lookback'
import type { CheckInText } from '@rca/core/lookback'
import type { UnitSystem } from '@rca/core/units'
import type { CheckInView } from '../worker/checkinKeeper'

/**
 * Which row is under the fitness card. One of the two: the check-in ("Since your last import") while it has not been seen,
 * else "Your years" while its lead has not been seen: a lead the athlete has opened, hidden or been shown twice does not
 * come back, and a new lead is shown once. Neither while an import is known partial, and neither for the sample.
 */

export type FirstRow = 'checkIn' | 'lookBack' | null

export interface RowInputs {
  checkIn: CheckInView
  /** What names the look-back's lead (see `yearsLead`, `leadKey`), or null when it has none to open on. */
  yearsLead?: string | null
  /** An import is known to have left the library short of the whole history: the held-back headline stands alone. */
  importIncomplete: boolean
  /** The page is showing the sample, which keeps no baseline. */
  isSample: boolean
}

/**
 * The row to show. None while an import is known partial (nothing is said of a part of the history), for the
 * sample, with no check-in, or once the athlete has seen the one there is (opened, hidden, or shown on two page loads).
 */
export function firstRowOf({
  checkIn,
  yearsLead = null,
  importIncomplete,
  isSample,
}: RowInputs): FirstRow {
  if (importIncomplete || isSample) return null
  if (checkIn.checkIn !== null && !checkIn.seen) return 'checkIn'
  // The check-in has nothing new, or has been seen: the years take the place until their lead is seen too.
  return yearsLead !== null && checkIn.lookBackSeenFor !== yearsLead ? 'lookBack' : null
}

/** The words of the check-in in the athlete's units. */
export const checkInWords = (view: CheckInView, units: UnitSystem): CheckInText | null =>
  view.checkIn === null ? null : checkInText(view.checkIn, units)
