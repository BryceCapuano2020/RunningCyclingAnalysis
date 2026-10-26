import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { AthleteSettings, CriticalPowerRefusal, EffortCheck, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { APP_NAME } from '../appName'
import type { BalanceGap } from '../ui/balanceGap'
import { balanceOfPick, type BalanceReading } from '../ui/components/balanceScale'
import { HARDER_EFFORTS_TITLE, balanceTitle, effortCaveat } from '../ui/components/headlineText'
import { pickHeadline } from '../ui/components/pickHeadline'
import { periodDates } from '../ui/components/rangeOptions'
import { plural } from '../ui/components/plural'
import { countSport, refusalOf, threshold } from '../ui/records'
import {
  SPORT_NOUN,
  SPORT_ORDER,
  SPORT_PLURAL,
  SPORT_TITLE,
  THRESHOLD_EFFORT_TEXT,
  THRESHOLD_NOUN,
} from '../ui/sports'
import { hasShareableContent } from './hasShareableContent'

/** An estimate's number and unit, so that the unit can be set smaller than the number. */
export interface ShareFigure {
  number: string
  unit: string
}

/** One sport's threshold on the card: the estimate, or what to add to see it. */
export interface ShareHero {
  sport: Sport
  /** The estimate's name, such as "Running threshold pace". */
  label: string
  /** The estimate, or null while the sport cannot be estimated yet. */
  figure: ShareFigure | null
  /** A second reading of the estimate, such as W/kg. */
  sub: string | null
  /** What to add to see the estimate. Set only when there is no figure. */
  prompt: string | null
}

/** The balance between the sports, read the same way as the page's meter. */
export type ShareMeter = BalanceReading

/**
 * Everything the share card shows. Built from the analysis on screen; it holds no account, file,
 * activity or date data.
 */
export interface ShareCardModel {
  title: string
  /**
   * The answer in an athlete's words. While the sports cannot be compared it states what is on
   * file, as "Your running so far", and never asks the reader to add files: the card is posted to
   * others, who did not add them.
   */
  headline: string
  /** The balance, or null while neither a grade gap nor an energy comparison exists. */
  meter: ShareMeter | null
  /** Running first, then cycling. */
  heroes: ShareHero[]
  /** The selected period, such as "Last 6 weeks". */
  period: string
  /** One line on the heart-rate effort, or null when heart rate does not raise a concern. */
  caveat: string | null
  footnote: string
  /** Site origin when it is public, or an empty string for a local or private address. */
  origin: string
  badge: string | null
}

/** The card's own words for what it is: the owner's estimate, comparing two sports, not a ranking. */
const FOOTNOTE = 'Estimated from my own files. Compares my two sports; not a ranking.'

const PRIVATE_IPV4 = [
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

/** Unique local (fc00::/7) and link-local (fe80::/10), by the first 16-bit group of the address. */
function isPrivateIpv6(host: string): boolean {
  const first = Number.parseInt(host.split(':')[0] ?? '', 16)
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

/** Whether a host name is this machine or a private network, so a shared card should not name it. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // ::/8 is the unspecified and loopback addresses, and the IPv4-compatible and IPv4-mapped forms,
  // which can name a private IPv4 host. None is a public site, so the whole block counts as private.
  if (host.startsWith('::') || host.endsWith('.local')) return true
  if (host.includes(':')) return isPrivateIpv6(host)
  return PRIVATE_IPV4.some((pattern) => pattern.test(host))
}

/** The origin when it names a public host, otherwise an empty string. */
export function shareableOrigin(origin: string): string {
  let hostname: string
  try {
    hostname = new URL(origin).hostname
  } catch {
    return ''
  }
  return isPrivateHost(hostname) ? '' : origin
}

/** Splits "23:23 /km" into its number and unit. A value with no space has no unit. */
function splitFigure(value: string): ShareFigure {
  const space = value.lastIndexOf(' ')
  if (space < 0) return { number: value, unit: '' }
  return { number: value.slice(0, space), unit: value.slice(space + 1) }
}

/** What to add to see a sport's estimate: its first activities, or harder ones when it has some. */
const RIDE_NEEDS_WEIGHT = 'Add your weight to see the ride estimate'

/**
 * What to add to see a sport's threshold: its first activities; with some, the efforts the fit needs,
 * or a harder one when the efforts are there but show no threshold.
 */
function promptFor(sport: Sport, count: number, refusal: CriticalPowerRefusal | null): string {
  if (count === 0) return `Add ${SPORT_PLURAL[sport]} to see the balance`
  return refusal === 'shape'
    ? `Add a harder effort of ${THRESHOLD_EFFORT_TEXT} to see the balance`
    : `Add ${SPORT_PLURAL[sport]} with efforts of ${THRESHOLD_EFFORT_TEXT} to see the balance`
}

function heroFor(
  result: AnalysisResult,
  sport: Sport,
  settings: AthleteSettings,
  units: UnitSystem,
  count: number,
  weightKnown: boolean,
): ShareHero {
  // Says "estimated" as the page's threshold label does, with the noun in lower case.
  const label = `${SPORT_TITLE[sport]} ${THRESHOLD_NOUN[sport]}, estimated`
  // A ride's estimate is in watts and W/kg, both worked out from body weight, so it waits for one.
  if (sport === 'ride' && !weightKnown) {
    return { sport, label, figure: null, sub: null, prompt: RIDE_NEEDS_WEIGHT }
  }
  const estimate = threshold(result, sport, settings.massKg, units)
  if (estimate === null) {
    return {
      sport,
      label,
      figure: null,
      sub: null,
      prompt: promptFor(sport, count, refusalOf(result, sport)),
    }
  }
  return {
    sport,
    label,
    figure: splitFigure(estimate.value),
    sub: estimate.sub,
    prompt: null,
  }
}

/** The period line on the card: its dates and what it counts, such as "Based on 12 May – 3 Aug 2025, 5 runs, 9 rides". */
function periodLine(period: Period, counts: Record<Sport, number>): string {
  return `Based on ${periodDates(period)}, ${plural(counts.run, 'run')}, ${plural(counts.ride, 'ride')}`
}

/**
 * The headline while the sports cannot be compared: the one sport on file, stated as what is there,
 * or the shared harder-efforts title when both sports are on file.
 */
function headlineWithoutComparison(counts: Record<Sport, number>): string {
  const withActivities = SPORT_ORDER.filter((sport) => counts[sport] > 0)
  const [only, ...rest] = withActivities
  if (only !== undefined && rest.length === 0) return `Your ${SPORT_NOUN[only]} so far`
  return HARDER_EFFORTS_TITLE
}

/**
 * The card for the balance on screen, or null when there is neither a comparison nor a sport's
 * estimate to share. Reads the same results, grade gap and formatters as the page, so the card
 * cannot disagree with it.
 */
export function buildShareCard(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  period: Period,
  isSample: boolean,
  effort: EffortCheck | null,
  weightKnown: boolean,
  gap: BalanceGap | null,
): ShareCardModel | null {
  if (!hasShareableContent(result)) return null
  // The balance is worked out from the ride, so it is left off the card until a weight is entered.
  const pick = weightKnown ? pickHeadline(result.comparison) : null
  const reading = weightKnown ? balanceOfPick(gap, pick) : null
  const counts: Record<Sport, number> = {
    run: countSport(result.activities, 'run'),
    ride: countSport(result.activities, 'ride'),
  }
  const heroes = SPORT_ORDER.map((sport) =>
    heroFor(result, sport, settings, units, counts[sport], weightKnown),
  )

  return {
    title: APP_NAME,
    headline: reading === null ? headlineWithoutComparison(counts) : balanceTitle(reading),
    meter: reading,
    heroes,
    period: periodLine(period, counts),
    caveat: effortCaveat(effort)?.short ?? null,
    footnote: FOOTNOTE,
    origin: typeof window === 'undefined' ? '' : shareableOrigin(window.location.origin),
    badge: isSample ? 'Sample data' : null,
  }
}
