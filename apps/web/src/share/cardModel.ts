import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { LIFT_STANDARDS_SOURCE } from '@rca/core/lift'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { RacePrediction } from '@rca/core/predict'
import type { TriangleSport } from '@rca/core/standing'
import type { AthleteSettings, Sport } from '@rca/core/types'
import { formatRecordTime } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { APP_WORDS } from '../appName'
import type { BalanceGap } from '../ui/balanceGap'
import { balanceOfPick } from '../ui/components/balanceScale'
import { heldPick } from '../ui/resultHold'
import type { HoldInputs } from '../ui/resultHold'
import { rideHoldInputs } from '../ui/rideLeftOut'
import { periodDates } from '../ui/components/rangeOptions'
import type { GradeOutcome } from '../ui/grades'
import type { LiftTileModel } from '../ui/lift/liftTile'
import { threshold } from '../ui/records'
import { BALANCE_PAIR } from '../ui/sports'
import { HEADLINE_NAME, THRESHOLD_NAME } from '../ui/thresholdName'
import { triangleAnswer, triangleTitleText } from '../ui/pages/triangleCopy'
import { triangleViewOf } from '../ui/triangleSports'
import type { TriangleView } from '../ui/triangleSports'
import { cardNameShown } from './cardName'
import { cornersSentence } from './cardTriangle'
import { hasShareableContent } from './hasShareableContent'

/** An estimate's number and unit, so that the unit can be set smaller than the number. */
export interface ShareFigure {
  number: string
  unit: string
}

/** One sport's headline figure on the card, as Balance's row for it shows it. A card is offered only when run and ride have one. */
export interface ShareHero {
  sport: TriangleSport
  /** The figure's name as Balance titles its row, such as "Half-marathon" or "Functional threshold power". */
  label: string
  figure: ShareFigure
  /** A second reading of the estimate, such as W/kg. */
  sub: string | null
}

/**
 * Everything the share card shows. Built from the analysis on screen; it holds no account, file,
 * activity or date data.
 */
export interface ShareCardModel {
  title: string
  /** The answer in an athlete's words, as the page states it. */
  headline: string
  /** The one line under the headline, as the page states it, or null when there is none. */
  line: string | null
  /** The level triangle's grades, the figure the page draws: run, cycling and lifting, each graded or with no grade yet. */
  triangle: TriangleView
  /** The image's description: the headline, the line and the three corners in one sentence. */
  alt: string
  /** Running first, then cycling, then lifting when it has a figure. */
  heroes: ShareHero[]
  /** The selected period's dates, such as "12 May – 3 Aug 2025". */
  period: string
  footnote: string
  /** The site's host when it is public, or an empty string for a local or private address. */
  origin: string
  badge: string | null
  /** The name the visitor typed for the card, trimmed, or null when there is none. Kept on this device. */
  name: string | null
}

/** A graded card names the standard its grades come from. */
const ROAD_FOOTNOTE = ROAD_STANDARDS_SOURCE.shortName
const LIFT_FOOTNOTE = LIFT_STANDARDS_SOURCE.cardName
/** Without a grade, the card says the figures are estimates. */
const ESTIMATE_FOOTNOTE = 'Estimated from your files.'

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

/** The figures Balance's rows lead with that the card repeats: the run's half marathon, and the lifting row. */
export interface CardFigures {
  /** The half marathon the run's row leads with (`headlineHalf`), or null when it leads with the threshold. */
  half: RacePrediction | null
  /** The lifting row (`liftTileOf`); its figure is null while no lift has an estimate. */
  lift: LiftTileModel | null
}

const NO_FIGURES: CardFigures = { half: null, lift: null }

/** Each sport's row name with its threshold: a run's threshold, a ride's functional threshold power. */
const THRESHOLD_LABEL: Record<Sport, string> = {
  run: THRESHOLD_NAME.run,
  ride: HEADLINE_NAME.ride,
}

/** One sport's threshold as its row shows it, or null when the sport has no threshold yet. */
function thresholdHero(
  result: AnalysisResult,
  sport: Sport,
  settings: AthleteSettings,
  units: UnitSystem,
): ShareHero | null {
  const estimate = threshold(result, sport, settings.massKg, units)
  if (estimate === null) return null
  return {
    sport,
    label: THRESHOLD_LABEL[sport],
    figure: splitFigure(estimate.value),
    sub: estimate.sub,
  }
}

/**
 * The heroes, in the rows' order, or null while either sport has no threshold. The run leads with its half marathon when its
 * row does, and lifting follows when its row has a figure: the big three total, or the heaviest lift's projected one-rep max.
 */
function heroesFor(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  figures: CardFigures,
): ShareHero[] | null {
  const heroes: ShareHero[] = []
  for (const sport of BALANCE_PAIR) {
    const hero = thresholdHero(result, sport, settings, units)
    if (hero === null) return null
    // Only a run predicts a half marathon, as on its row.
    const half = { run: figures.half, ride: null }[sport]
    heroes.push(
      half === null
        ? hero
        : {
            sport,
            label: HEADLINE_NAME.half,
            figure: { number: formatRecordTime(half.seconds), unit: '' },
            sub: null,
          },
    )
  }
  const { lift } = figures
  if (lift !== null && lift.figure !== null) {
    heroes.push({ sport: 'lift', label: lift.heading, figure: lift.figure, sub: null })
  }
  return heroes
}

/**
 * The card for the balance on screen, or null when it is not offered: a weight, a balance, and a
 * threshold for each sport are all needed, so the card never asks the reader for anything. Reads the
 * same results, grades, grade gap and lead as the page, so the card cannot disagree with it. The
 * triangle is the one the page draws, so lifting's corner is on the card as it is on the page.
 */
export function buildShareCard(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  period: Period,
  isSample: boolean,
  weightKnown: boolean,
  gap: BalanceGap | null,
  grades: Record<Sport, GradeOutcome | null>,
  name: string | null = null,
  hold: HoldInputs = {},
  triangle: TriangleView = triangleViewOf(grades),
  figures: CardFigures = NO_FIGURES,
): ShareCardModel | null {
  // The ride's own reason to be out of the comparison joins what the app holds, as it does on screen.
  const held = rideHoldInputs(grades.ride, result, hold)
  if (!hasShareableContent(result, gap, weightKnown, held)) return null
  const { pick } = heldPick(result, held)
  const reading = balanceOfPick(gap, pick)
  const heroes = heroesFor(result, settings, units, figures)
  if (reading === null || heroes === null) return null
  const answer = triangleAnswer(reading, triangle, pick?.point.durationS)
  const headline = triangleTitleText(answer.title)
  // The footnote names the standard each graded corner comes from: the road standards for run and cycling, the meet lifts for lifting.
  const sources = [
    ...(BALANCE_PAIR.some((sport) => triangle.grades[sport].kind === 'graded')
      ? [ROAD_FOOTNOTE]
      : []),
    ...(triangle.grades.lift.kind === 'graded' ? [LIFT_FOOTNOTE] : []),
  ]
  return {
    title: APP_WORDS,
    headline,
    line: answer.line,
    triangle,
    alt: [`${headline}.`, answer.line, cornersSentence(triangle)].filter(Boolean).join(' '),
    heroes,
    period: periodDates(period),
    footnote: sources.length > 0 ? `Graded on ${sources.join(' and ')}.` : ESTIMATE_FOOTNOTE,
    origin: typeof window === 'undefined' ? '' : shareableHost(window.location.origin),
    badge: isSample ? 'Sample athlete' : null,
    name: cardNameShown(name ?? ''),
  }
}
