import { HALF_MARATHON_M, MARATHON_M } from '../constants'
import { civilOfDay, localDayOfInstant } from '../calendar'
import { formatDuration } from '../units/format'
import { formatPace, formatPower } from '../units'
import type { UnitSystem } from '../units'
import { sized, withinText } from '../fitness/copy'
import { shownChange } from '../fitness/copy'
import type { Ranged } from '../fitness/types'
import type { Sport } from '../types'
import type { LookBack, SportLookBack } from './compute'
import type { Lead } from './lead'
import type {
  EffortMilestones,
  HindsightEpisode,
  HindsightFitness,
  QuietStretch,
  Span,
  TooShort,
} from './types'

/**
 * The words of the look-back. Every date carries its year, every claim about the level that the look-back cannot see
 * past the horizon is dated to it, and a change is told in the page's own terms (a run in pace, a ride in power).
 * Plain, in the reader's voice; no cause is ever given.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "May 2021". */
export const monthYear = (ms: number): string => {
  const date = new Date(ms)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "14 May 2021". */
export const dayMonthYear = (ms: number): string => {
  const date = new Date(ms)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** "14 May 2021" in the viewer's own zone, for a moment of the wall clock (an import) rather than of a workout. */
export const localDayMonthYear = (ms: number): string => {
  const { year, month, date } = civilOfDay(localDayOfInstant(ms))
  return `${date} ${MONTHS[month]} ${year}`
}

/** A stretch of months: "January to April 2020", "November 2019 to February 2020". */
export function monthsBetween(fromMs: number, toMs: number): string {
  const [a, b] = [new Date(fromMs), new Date(toMs)]
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${MONTHS[a.getUTCMonth()]} to ${monthYear(toMs)}`
    : `${monthYear(fromMs)} to ${monthYear(toMs)}`
}

/** What each sport's level is called, and how a change in it is worded. */
export const SAY: Record<
  Sport,
  { subject: string; down: string; up: string; steady: string; doing: string; all: string }
> = {
  run: {
    subject: 'pace',
    down: 'slower',
    up: 'faster',
    steady: 'steady runs',
    doing: 'steady running',
    all: 'runs',
  },
  ride: {
    subject: 'power',
    down: 'lower',
    up: 'higher',
    steady: 'steady rides',
    doing: 'steady riding',
    all: 'rides',
  },
}

export const level = (sport: SportLookBack): string =>
  `your ${SAY[sport.sport].subject} at ${sport.referenceHr === null ? 'the same heart rate' : `${sport.referenceHr} bpm`}`

/** The size of a change and its range, as the page writes it, and which way it went. */
function amount(sport: Sport, change: Ranged): string {
  const shown = shownChange(sport, change)
  return `${sized(sport, change)} ${shown.value < 0 ? SAY[sport].down : SAY[sport].up}`
}

/** How long, in whole years and months: "3 years 4 months". */
export function standing(fromMs: number, toMs: number): string {
  const months = Math.max(0, Math.round((toMs - fromMs) / (30.4375 * 86_400_000)))
  const [y, m] = [Math.floor(months / 12), months % 12]
  const part = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
  if (y === 0) return part(m, 'month')
  return m === 0 ? part(y, 'year') : `${part(y, 'year')} ${part(m, 'month')}`
}

/** The break that an after-break step sits beside, from the breaks the sport had. */
function breakNear(years: HindsightFitness, episode: HindsightEpisode): Span | undefined {
  const near = 6 * 7 * 86_400_000
  return years.breaks.find(
    (b) => episode.fromMs >= b.fromMs - near && episode.fromMs <= b.toMs + near,
  )
}

/** An episode as one sentence, told in the reader's voice. `held` adds that a rise stayed through the horizon. */
export function episodeSentence(
  episode: HindsightEpisode,
  sport: SportLookBack,
  years: HindsightFitness,
  held = false,
): string {
  const s = sport.sport
  const you = level(sport)
  const from = monthYear(episode.fromMs)
  const to = episode.toMs === null ? null : monthYear(episode.toMs)
  switch (episode.kind) {
    case 'slip-back':
      return `From ${from} ${you} was about ${amount(s, episode.change)}. By ${to} it was back.`
    case 'slip-partly-back':
      return `From ${from} ${you} was about ${amount(s, episode.change)}. By ${to} it had come back about ${sized(s, episode.regained!)} and was still about ${amount(s, episode.remaining!)} than before ${from}.`
    case 'slip-open':
      // One that ended before the horizon was followed by a further fall, and the level had not come back when it began.
      return to === null
        ? `From ${from} ${you} was about ${amount(s, episode.change)}, and in ${monthYear(years.toMs)} it was still lower. The last 12 weeks are on your fitness card.`
        : `From ${from} ${you} was about ${amount(s, episode.change)}, and stayed lower until it fell again in ${to}.`
    case 'improvement': {
      const span = monthsBetween(episode.fromMs, episode.toMs ?? years.toMs)
      return `${you[0]!.toUpperCase()}${you.slice(1)} got about ${amount(s, episode.change)} between ${span.replace(' to ', ' and ')}${held ? `, and held there through ${monthYear(years.toMs)}` : ''}.`
    }
    case 'after-break': {
      const gap = breakNear(years, episode)
      const lead =
        gap === undefined
          ? `After a break from running in ${from},`
          : `No ${SAY[s].steady} from ${monthsBetween(gap.fromMs, gap.toMs)}. When they resumed,`
      return `${lead} ${you} was about ${amount(s, episode.change)}.`
    }
  }
}

/** One row of the list of episodes. */
export function episodeRow(
  episode: HindsightEpisode,
  sport: SportLookBack,
  years: HindsightFitness,
): string {
  const s = sport.sport
  const span =
    episode.toMs === null ? monthYear(episode.fromMs) : monthsBetween(episode.fromMs, episode.toMs)
  const runs = `${episode.runs} ${SAY[s].steady}.`
  switch (episode.kind) {
    case 'slip-back':
      return `${span}. Slipped about ${sized(s, episode.change)}, then back. ${runs}`
    case 'slip-partly-back':
      return `${span}. Slipped about ${sized(s, episode.change)}, then came back about ${sized(s, episode.regained!)}. ${runs}`
    case 'slip-open':
      return episode.toMs === null
        ? `From ${span}. Slipped about ${sized(s, episode.change)}, and was still lower in ${monthYear(years.toMs)}. ${runs}`
        : `${span}. Slipped about ${sized(s, episode.change)}, and stayed lower until it fell again. ${runs}`
    case 'improvement':
      return `${span}. Got about ${amount(s, episode.change)}. ${runs}`
    case 'after-break':
      return `${episodeSentence(episode, sport, years)}`
  }
}

export function quietRow(q: QuietStretch, sport: Sport): string {
  return `${monthsBetween(q.fromMs, q.toMs)}. Stayed within ${withinText(sport, q.within)}. ${q.runs} ${SAY[sport].steady}.`
}

export const thinRow = (s: Span, sport: Sport = 'run'): string =>
  `No ${SAY[sport].steady} from ${monthsBetween(s.fromMs, s.toMs)}.`
export const breakRow = (s: Span, sport: Sport = 'run'): string =>
  `No ${SAY[sport].all} from ${monthsBetween(s.fromMs, s.toMs)}.`

/** What an effort is called: "5 min", "20 min", "60 min", "5 km", "10 km", "half marathon". */
export function effortName(effort: EffortMilestones['effort']): string {
  if (effort.kind === 'duration') return `${effort.durationS / 60} min`
  if (effort.distanceM === MARATHON_M) return 'marathon'
  if (effort.distanceM === HALF_MARATHON_M) return 'half marathon'
  return `${effort.distanceM / 1000} km`
}

/** A best as the page writes it: a pace or a power for a length of time, a time for a distance. */
export function bestValue(
  m: Pick<EffortMilestones, 'unit'>,
  value: number,
  system: UnitSystem,
): string {
  if (m.unit === 'm/s') return formatPace(value, system)
  if (m.unit === 'W') return formatPower(value)
  if (m.unit === 'W/kg') return `${value.toFixed(2)} W/kg`
  return formatDuration(value)
}

/** The bests rows of one effort: the best and how long it has stood, and the best of each year. */
export function bestRows(m: EffortMilestones, asOfMs: number, system: UnitSystem): string[] {
  const name = effortName(m.effort)
  const rows = [
    `Best ${name}: ${bestValue(m, m.best.value, system)}, set on ${dayMonthYear(m.best.atMs)}; it has stood ${standing(m.best.atMs, asOfMs)} as of ${dayMonthYear(asOfMs)}.`,
  ]
  if (m.years.length >= 2) {
    rows.push(
      `By year: ${m.years.map((y) => `${y.year}${y.partial ? ' (so far)' : ''} ${bestValue(m, y.value, system)}`).join(', ')}.`,
    )
  }
  // A pace is faster or slower; a power, in watts or watts per kilogram, is higher or lower.
  const [up, down] = m.unit === 'm/s' ? ['Faster', 'Slower'] : ['Higher', 'Lower']
  for (const v of m.verdicts) {
    if (v.verdict === 'higher') rows.push(`${up} in ${v.year} than in ${v.year - 1}.`)
    if (v.verdict === 'lower') rows.push(`${down} in ${v.year} than in ${v.year - 1}.`)
    if (v.verdict === 'none') rows.push(`No clear change from ${v.year - 1} to ${v.year}.`)
  }
  return rows
}

/** What a sport needs before its years can be told, and how far it is. */
export function tooShortText(t: TooShort, sport: Sport = 'run'): string {
  const say = SAY[sport]
  return `Needs ${t.needSteady} ${say.steady} over ${t.needWeeks} weeks. You have ${t.steady} over ${t.weeks}.`
}

/** The lead of the look-back as one sentence, in the reader's units. */
export function leadSentence(lead: Lead, lookBack: LookBack, system: UnitSystem): string {
  const sport = lookBack.sports[lead.sport]
  if (lead.kind === 'episode') {
    return episodeSentence(lead.episode, sport, sport.fitness as HindsightFitness, lead.held)
  }
  if (lead.kind === 'quiet') {
    const q = lead.stretch
    return `From ${monthYear(q.fromMs)} to ${monthYear(q.toMs)} ${level(sport)} stayed within ${withinText(lead.sport, q.within)}: ${q.runs} ${SAY[lead.sport].steady}.`
  }
  const m = lead.best
  return `Your best ${effortName(m.effort)} is ${bestValue(m, m.best.value, system)}, set on ${dayMonthYear(m.best.atMs)}. As of ${dayMonthYear(lookBack.asOfMs)} it has stood for ${standing(m.best.atMs, lookBack.asOfMs)}.`
}
