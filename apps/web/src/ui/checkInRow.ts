import { checkInText } from '@rca/core/lookback'
import type { CheckInText } from '@rca/core/lookback'
import type { UnitSystem } from '@rca/core/units'
import type { CheckInView } from '../worker/checkinKeeper'

/**
 * Which row is under the fitness card. One of the two: the check-in ("Since your last import") while it has not been seen,
 * else "Your years" while it has a lead to tell and has not been hidden. Neither while an import is known partial, and
 * neither for the sample.
 */

export type FirstRow = 'checkIn' | 'lookBack' | null

export interface RowInputs {
  checkIn: CheckInView
  /** The look-back has something to open on (see `yearsLead`). */
  hasYears?: boolean
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
  hasYears = false,
  importIncomplete,
  isSample,
}: RowInputs): FirstRow {
  if (importIncomplete || isSample) return null
  if (checkIn.checkIn !== null && !checkIn.seen) return 'checkIn'
  // The check-in has nothing new, or has been seen: the years take the place for as long as they have news and are not hidden.
  return hasYears && checkIn.lookBackSeen !== true ? 'lookBack' : null
}

/** The words of the check-in in the athlete's units. */
export const checkInWords = (view: CheckInView, units: UnitSystem): CheckInText | null =>
  view.checkIn === null ? null : checkInText(view.checkIn, units)
