import type { Period } from '@rca/core/period'
import type { Sport } from '@rca/core/types'
import { wholeCentre } from '../../domain/lean'
import type { BalanceReading } from '../components/balanceScale'
import {
  balanceTitle,
  percentEdge,
  readFrom,
  rangeText,
  signedCount,
} from '../components/headlineText'
import { RANGE_OPTIONS, lengthOf, periodDates } from '../components/rangeOptions'
import { sameChoice } from '@rca/core/period'
import { SPORT_NOUN } from '../sports'

/** A no-break space, so a number and its unit never part across a line. */
const NO_BREAK = ' '

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

/** What the range says about the lead: it holds across the whole range, or the range reaches level. */
export function rangeVerdictText(reading: BalanceReading): string | null {
  const { low, high } = reading.lead
  if (Math.round(low) === Math.round(high)) return null
  const holds = Math.round(low) > 0 || Math.round(high) < 0
  return holds ? 'so the lead holds across the range' : 'so the two could be level'
}

/** The figure the scoreboard sets large, and the words under it: the size, its side, and the range. */
export interface GapFigure {
  number: string
  unit: string
  /** Which way the gap goes: "toward running", "same grade", or "energy toward running". */
  side: string
  /** The 90% range: "90% range 1 to 12 points", held whole on one line. */
  range: string
  /** The two joined, for a line that has room for both. */
  note: string
}

/**
 * The gap as a scoreboard figure: "+6" and "pts", over "toward running · range 1 to 12 points". A level gap of
 * zero names no side. An energy balance, which has no grades to take points from, is a percent.
 */
export function gapFigure(reading: BalanceReading): GapFigure {
  const size = Math.abs(wholeCentre(reading.lead))
  const side = readFrom(reading)
  const range = `90% range${NO_BREAK}${rangeText(reading)}`
  if (reading.unit === 'percent') {
    const percent = percentEdge(Math.abs(reading.lead.centre), false)
    return {
      number: `+${percent.replace('%', '')}`,
      unit: '%',
      side: `energy toward ${SPORT_NOUN[side]}`,
      range,
      note: `energy toward ${SPORT_NOUN[side]} · ${range}`,
    }
  }
  if (size === 0) {
    return { number: '0', unit: 'pts', side: 'same grade', range, note: `same grade · ${range}` }
  }
  const toward = `toward ${SPORT_NOUN[side]}`
  return {
    number: signedCount(size),
    unit: 'pts',
    side: toward,
    range,
    note: `${toward} · ${range}`,
  }
}
