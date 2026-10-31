import { checkInText } from '@rca/core/lookback'
import type { CheckInText } from '@rca/core/lookback'
import type { UnitSystem } from '@rca/core/units'
import type { CheckInView } from '../worker/checkinKeeper'

/**
 * What the row under the fitness card says, and whether it is the first thing there. The row is the check-in
 * ("Since your last import"); the look-back row of D9a shares the place and is chosen here when it is built.
 */

export type FirstRow = 'checkIn' | null

export interface RowInputs {
  checkIn: CheckInView
  /** An import is known to have left the library short of the whole history: the held-back headline stands alone. */
  importIncomplete: boolean
  /** The page is showing the sample, which keeps no baseline. */
  isSample: boolean
}

/**
 * The row to show. None while an import is known partial (nothing is said of a part of the history), for the
 * sample, with no check-in, or once the athlete has seen the one there is (opened, hidden, or shown on two page loads).
 */
export function firstRowOf({ checkIn, importIncomplete, isSample }: RowInputs): FirstRow {
  if (importIncomplete || isSample) return null
  if (checkIn.checkIn === null || checkIn.seen) return null
  return 'checkIn'
}

/** The words of the check-in in the athlete's units. */
export const checkInWords = (view: CheckInView, units: UnitSystem): CheckInText | null =>
  view.checkIn === null ? null : checkInText(view.checkIn, units)
