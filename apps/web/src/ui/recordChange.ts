import { directionOf, verdictOfCall } from '@rca/core/change/types'
import type { ChangeCall } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'
import { PACE_UNIT, formatPower, formatRecordTime, paceSeconds } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { perKilogramWords, shownDirection } from './changeWords'

/** The words every "no clear change" line begins with; each follows them with "from" and the period it is against. */
export const NO_CLEAR_CHANGE = 'No clear change'

/** A record as the page shows it: which way the shown figures moved, the amount in words, and the words for more and less. */
interface Figure {
  shown: -1 | 0 | 1
  amount: string
  words: [more: string, less: string]
  /** Whether a shown figure that has not moved means the record has not (a pace), or may be the weight's doing (watts). */
  roundsToNothing: boolean
}

/** Each sport's figure for a record: a run's pace to the whole second the page shows, a ride's watts. */
const FIGURE: Record<Sport, (now: number, before: number, units: UnitSystem) => Figure> = {
  run: (now, before, units) => {
    // Each pace is taken to the whole second the page shows, then the two are compared; a shorter pace is faster.
    const gain = Math.round(paceSeconds(before, units)) - Math.round(paceSeconds(now, units))
    return {
      shown: shownDirection(gain),
      amount: `${formatRecordTime(Math.abs(gain))} ${PACE_UNIT[units]}`,
      words: ['faster', 'slower'],
      roundsToNothing: true,
    }
  },
  ride: (now, before) => {
    const watts = Math.round(now) - Math.round(before)
    return {
      shown: shownDirection(watts),
      amount: formatPower(Math.abs(watts)),
      words: ['more', 'less'],
      roundsToNothing: false,
    }
  },
}

/**
 * How a record moved against the same record in the period before, in words: "0:12 /mi faster than
 * previous 6 weeks" or "8 W more than previous 6 weeks". Whether it moved is the change test's call for the record's
 * effort length: a figure inside what chance puts between the two periods, or one that rounds the same on the page,
 * reads "No clear change from"; a length the test could not judge (too few efforts in either period) reads nothing. Null
 * also when the earlier period has no figure.
 *
 * Which way it moved is the call's own (the compared unit: a run's flat speed, a ride's watts per kilogram), never the
 * displayed watts, which a change of weight can move the other way; where the two disagree the words are the call's
 * ("5% more power per kilogram"). `now` and `before` are in the sport's own unit and write the amount.
 */
export function recordChange(
  sport: Sport,
  now: number,
  before: number,
  units: UnitSystem,
  previousLabel: string,
  call: ChangeCall | undefined,
): string | null {
  const verdict = verdictOfCall(call)
  if (!Number.isFinite(now) || !Number.isFinite(before) || verdict === 'untested') return null
  const earlier = previousLabel.toLowerCase()
  const none = `${NO_CLEAR_CHANGE} from ${earlier}`
  if (verdict === 'none') return none
  const direction = directionOf(call)
  const figure = FIGURE[sport](now, before, units)
  // A pace that rounds to the same second is no move at all, whatever the call.
  if (figure.shown === 0 && figure.roundsToNothing) return none
  // The displayed figure moved the other way, or not at all, though the compared unit moved: say it in that unit.
  if (figure.shown !== direction) {
    const perKilo = perKilogramWords(sport, call, 'record')
    return perKilo === null ? none : `${perKilo} than ${earlier}`
  }
  return `${figure.amount} ${direction > 0 ? figure.words[0] : figure.words[1]} than ${earlier}`
}
