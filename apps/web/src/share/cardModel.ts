import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { AthleteSettings, EffortCheck, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { APP_WORDS } from '../appName'
import type { BalanceGap } from '../ui/balanceGap'
import { balanceOfPick, type BalanceReading } from '../ui/components/balanceScale'
import { effortCaveat } from '../ui/effortCaveat'
import { balanceTitle, leadSentence } from '../ui/components/headlineText'
import { heldPick } from '../ui/resultHold'
import { rideHoldInputs } from '../ui/rideLeftOut'
import { periodDates } from '../ui/components/rangeOptions'
import { plural } from '../ui/components/plural'
import { heroGradeLine, LEVEL_NOT_RANKING, type GradeOutcome } from '../ui/grades'
import { countSport, threshold } from '../ui/records'
import { SPORT_ORDER, THRESHOLD_EFFORT_TEXT, THRESHOLD_LABEL } from '../ui/sports'
import { cardNameShown } from './cardName'
import { hasShareableContent } from './hasShareableContent'

/**
 * A threshold's name on the share card. A run says "flat pace" here, since the card has no page Flat
 * note to say so; the app's own cards and pages keep THRESHOLD_LABEL.
 */
const CARD_THRESHOLD_LABEL: Record<Sport, string> = {
  run: 'Threshold flat pace, estimated',
  ride: THRESHOLD_LABEL.ride,
}

/** An estimate's number and unit, so that the unit can be set smaller than the number. */
export interface ShareFigure {
  number: string
  unit: string
}

/** One sport's threshold on the card. A card is offered only when every sport has one. */
export interface ShareHero {
  sport: Sport
  /** The estimate's name and the efforts it rests on, such as "Threshold flat pace, estimated from your best 3 to 20 min". */
  label: string
  figure: ShareFigure
  /** A second reading of the estimate, such as W/kg. */
  sub: string | null
  /** The sport's level and the effort it grades, as heroGradeLine writes it, or null when it is not on the card. */
  grade: string | null
}

/** The balance between the sports, read the same way as the page's meter. */
export type ShareMeter = BalanceReading

/**
 * Everything the share card shows. Built from the analysis on screen; it holds no account, file,
 * activity or date data.
 */
export interface ShareCardModel {
  title: string
  /** The answer in an athlete's words, as the page states it. */
  headline: string
  /** The lead in one line under the headline, as the page's meter states it; null for an even balance. */
  magnitude: string | null
  /** The balance, or null when the card has no meter. */
  meter: ShareMeter | null
  /** Running first, then cycling. */
  heroes: ShareHero[]
  /** The selected period, such as "Last 6 weeks". */
  period: string
  /** One line on the heart-rate effort, or null when heart rate does not raise a concern. */
  caveat: string | null
  footnote: string
  /** The site's host when it is public, or an empty string for a local or private address. */
  origin: string
  badge: string | null
  /** The name the visitor typed for the card, trimmed, or null when there is none. Kept on this device. */
  name: string | null
}

/** A graded card names the standard its levels come from, and says what a level is. */
const GRADED_FOOTNOTE = `Graded on the ${ROAD_STANDARDS_SOURCE.shortName}. ${LEVEL_NOT_RANKING}`
/** Without a grade, the card says the figures are estimates and not a ranking. */
const ESTIMATE_FOOTNOTE = 'Estimated from your files. Not a ranking.'

const PRIVATE_IPV4 = [
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  // The carrier-grade NAT block, 100.64.0.0/10, which tailnets and mobile networks use.
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
]

/** Names a home, a tailnet, a company network or a test setup uses, and localhost, which no public site has. */
const PRIVATE_NAME =
  /(^|\.)(localhost|local|localdomain|lan|corp|home\.arpa|internal|test|ts\.net)$/

/** Unique local (fc00::/7) and link-local (fe80::/10), by the first 16-bit group of the address. */
function isPrivateIpv6(host: string): boolean {
  const first = Number.parseInt(host.split(':')[0] ?? '', 16)
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

/** Whether a host name is this machine or a private network, so a shared card should not name it. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  if (PRIVATE_NAME.test(host)) return true
  // ::/8 is the unspecified and loopback addresses, and the IPv4-compatible and IPv4-mapped forms,
  // which can name a private IPv4 host. None is a public site, so the whole block counts as private.
  if (host.startsWith('::')) return true
  if (host.includes(':')) return isPrivateIpv6(host)
  return PRIVATE_IPV4.some((pattern) => pattern.test(host))
}

/**
 * The host a shared card names: a public https site, without its scheme or port. An http origin, a
 * local or private address, and a private name name no site, so they give an empty string.
 */
export function shareableHost(origin: string): string {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' || isPrivateHost(url.hostname)) return ''
  // An IPv6 host is written in brackets in a URL; the card prints the bare address.
  return url.hostname.replace(/^\[(.*)\]$/, '$1')
}

/** Splits "23:23 /km" into its number and unit. A value with no space has no unit. */
function splitFigure(value: string): ShareFigure {
  const space = value.lastIndexOf(' ')
  if (space < 0) return { number: value, unit: '' }
  return { number: value.slice(0, space), unit: value.slice(space + 1) }
}

/** One sport's hero, or null when the sport has no threshold yet. */
function heroFor(
  result: AnalysisResult,
  sport: Sport,
  settings: AthleteSettings,
  units: UnitSystem,
  outcome: GradeOutcome | null,
): ShareHero | null {
  const estimate = threshold(result, sport, settings.massKg, units)
  if (estimate === null) return null
  return {
    sport,
    // Says "estimated" and the efforts it rests on, in the words the card's threshold label uses.
    label: `${CARD_THRESHOLD_LABEL[sport]} from your best ${THRESHOLD_EFFORT_TEXT}`,
    figure: splitFigure(estimate.value),
    sub: estimate.sub,
    grade: outcome?.kind === 'graded' ? heroGradeLine(outcome.grade) : null,
  }
}

/** Both heroes, running first, or null while either sport has no threshold. */
function heroesFor(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  grades: Record<Sport, GradeOutcome | null>,
): ShareHero[] | null {
  const heroes: ShareHero[] = []
  for (const sport of SPORT_ORDER) {
    const hero = heroFor(result, sport, settings, units, grades[sport])
    if (hero === null) return null
    heroes.push(hero)
  }
  return heroes
}

/** The period line on the card: its dates and what it counts, such as "Based on 12 May – 3 Aug 2025, 5 runs, 9 rides". */
function periodLine(period: Period, counts: Record<Sport, number>): string {
  return `Based on ${periodDates(period)}, ${plural(counts.run, 'run')}, ${plural(counts.ride, 'ride')}`
}

/**
 * The card for the balance on screen, or null when it is not offered: a weight, a balance, and a
 * threshold for each sport are all needed, so the card never asks the reader for anything. Reads the
 * same results, grades, grade gap and lead as the page, so the card cannot disagree with it.
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
  grades: Record<Sport, GradeOutcome | null>,
  name: string | null = null,
): ShareCardModel | null {
  if (!hasShareableContent(result, gap, weightKnown, grades.ride)) return null
  const { pick } = heldPick(result, rideHoldInputs(grades.ride, result))
  const reading = balanceOfPick(gap, pick)
  const heroes = heroesFor(result, settings, units, grades)
  if (reading === null || heroes === null) return null
  const counts: Record<Sport, number> = {
    run: countSport(result.activities, 'run'),
    ride: countSport(result.activities, 'ride'),
  }

  return {
    title: APP_WORDS,
    headline: balanceTitle(reading),
    magnitude: leadSentence(reading),
    meter: reading,
    heroes,
    period: periodLine(period, counts),
    caveat: effortCaveat(effort)?.short ?? null,
    footnote: heroes.some((hero) => hero.grade !== null) ? GRADED_FOOTNOTE : ESTIMATE_FOOTNOTE,
    origin: typeof window === 'undefined' ? '' : shareableHost(window.location.origin),
    badge: isSample ? 'Sample athlete' : null,
    name: cardNameShown(name ?? ''),
  }
}
