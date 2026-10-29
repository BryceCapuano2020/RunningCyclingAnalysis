import type { Period } from '@rca/core/period'
import type { Sport } from '@rca/core/types'
import type { BalanceReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { RANGE_OPTIONS, lengthOf, periodDates } from '../components/rangeOptions'
import { sameChoice } from '@rca/core/period'
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
 * The period's name as the period control names it: its own label for a choice it offers, "Custom" for a
 * range entered, so the line over the headline and the control agree. The default period spans a few days
 * more or less than its 12 weeks when the library is short, and is still called 12 weeks.
 */
function periodName(period: Period): string {
  const offered = RANGE_OPTIONS.find((option) => sameChoice(option.choice, period.choice))
  if (offered !== undefined) return offered.label
  return period.days === null ? 'Custom' : lengthOf(period.days)
}

/** The line over the headline: the page, the period's name, and its dates, such as "Balance · 12 weeks · 21 Apr – 3 Jun 2025". */
export function eyebrowText(period: Period): string {
  const length = periodName(period)
  const dates = periodDates(period)
  return ['Balance', length, dates].filter((part) => part !== '').join(' · ')
}
