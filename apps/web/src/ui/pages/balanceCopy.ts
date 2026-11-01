import type { Period } from '@rca/core/period'
import type { Sport } from '@rca/core/types'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { lengthOf, periodName } from '../components/rangeOptions'
import { SPORT_NOUN } from '../sports'

/** The headline split at the sport it names, so that sport can be marked: the words before it, then the sport. */
export interface TitleParts {
  lead: string
  /** The sport the balance leans toward, set apart in the heading; null for a level balance, which names none. */
  sport: Sport | null
  noun: string
}

/**
 * The headline as `balanceTitle` words it, in two parts. A balance that leans names the sport it leans toward
 * last, so it ends with that sport's word; a level balance is one phrase.
 */
export function titleParts(reading: BalanceReading): TitleParts {
  const title = balanceTitle(reading)
  if (reading.lean === 'even') return { lead: title, sport: null, noun: '' }
  const noun = SPORT_NOUN[reading.lean]
  return { lead: title.slice(0, title.length - noun.length), sport: reading.lean, noun }
}

/**
 * The line over the headline: the period as a length, "Last 12 weeks", "All time", or "Custom period" for a range
 * entered. The dates are on the period line under the headline, so they are not said twice. The default is named for
 * the window it resolved to.
 */
export function eyebrowText(period: Period): string {
  if (typeof period.choice === 'object') return 'Custom period'
  return period.days === null ? periodName(null) : `Last ${lengthOf(period.days)}`
}
