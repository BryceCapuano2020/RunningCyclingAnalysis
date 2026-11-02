import { HALF_MARATHON_M, MARATHON_M } from '../constants'
import { civilOfDay, localDayOfInstant } from '../calendar'
import { formatDuration } from '../units/format'
import { formatPace, formatPower } from '../units'
import type { UnitSystem } from '../units'
import { oneSided, shownChange, sized, withinText } from '../fitness/copy'
import type { Ranged } from '../fitness/types'
import type { Sport } from '../types'
import type { LookBack, SportLookBack } from './compute'
import type { Lead } from './lead'
import type { EffortMilestones, HindsightEpisode, HindsightFitness, Span } from './types'

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
  {
    subject: string
    down: string
    up: string
    steady: string
    all: string
    /** What a break was from: "After a break from running". */
    breakFrom: string
  }
> = {
  run: {
    subject: 'pace',
    down: 'slower',
    up: 'faster',
    steady: 'steady runs',
    all: 'runs',
    breakFrom: 'running',
  },
  ride: {
    subject: 'power',
    down: 'lower',
    up: 'higher',
    steady: 'steady rides',
    all: 'rides',
    breakFrom: 'riding',
  },
}

export const level = (sport: SportLookBack): string =>
  `your ${SAY[sport.sport].subject} at ${sport.referenceHr === null ? 'the same heart rate' : `${sport.referenceHr} bpm`}`

/** The size of a change and its range, as the page writes it, and which way it went. */
function amount(sport: Sport, change: Ranged): string {
  const shown = shownChange(sport, change)
  return `${sized(sport, change)} ${shown.value < 0 ? SAY[sport].down : SAY[sport].up}`
}

/** How long a best has stood, in whole years: "Stood 8 years." Nothing under a year, which is no news. */
export function stoodText(fromMs: number, toMs: number): string {
  const years = Math.floor(Math.max(0, toMs - fromMs) / (365.25 * 86_400_000))
  return years === 0 ? '' : `Stood ${years} ${years === 1 ? 'year' : 'years'}.`
}

/** The break that an after-break step sits beside, from the breaks the sport had. */
function breakNear(years: HindsightFitness, episode: HindsightEpisode): Span | undefined {
  const near = 6 * 7 * 86_400_000
  return years.breaks.find(
    (b) => episode.fromMs >= b.fromMs - near && episode.fromMs <= b.toMs + near,
  )
}

const upper = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

/** What is still missing after a partial return, as a short sentence, or nothing when it is no longer on one side of level. */
const stillOff = (s: Sport, remaining: Ranged | null): string =>
  remaining !== null && oneSided(remaining) ? ` Still ${sized(s, remaining)} off.` : ''

/**
 * An episode as short sentences, each with at most one range and the size first, told in the reader's voice. `held`
 * adds that a rise stayed through the horizon.
 */
export function episodeSentence(
  episode: HindsightEpisode,
  sport: SportLookBack,
  years: HindsightFitness,
  held = false,
): string {
  const s = sport.sport
  const from = monthYear(episode.fromMs)
  const to = episode.toMs === null ? null : monthYear(episode.toMs)
  const slipped = `Slipped ${sized(s, episode.change)} in ${from}.`
  switch (episode.kind) {
    case 'slip-back':
      return `${slipped} Back by ${to}.`
    case 'slip-partly-back':
      return `${slipped} Up ${sized(s, episode.regained!)} by ${to}.${stillOff(s, episode.remaining)}`
    case 'slip-open':
      // One that ended before the horizon was followed by a further fall, and the level had not come back when it began.
      return to === null
        ? `${slipped} Still lower in ${monthYear(years.toMs)}.`
        : `${slipped} Stayed lower until it fell again in ${to}.`
    case 'improvement': {
      const span = monthsBetween(episode.fromMs, episode.toMs ?? years.toMs)
      const holds = held ? ` Held through ${monthYear(years.toMs)}.` : ''
      return `Improved ${sized(s, episode.change)} between ${span.replace(' to ', ' and ')}.${holds}`
    }
    case 'after-break': {
      const gap = breakNear(years, episode)
      const how = `${SAY[s].subject} was ${amount(s, episode.change)}`
      return gap === undefined
        ? `${upper(how)} after a break from ${SAY[s].breakFrom} in ${from}.`
        : `No ${SAY[s].steady} from ${monthsBetween(gap.fromMs, gap.toMs)}. Then ${how}.`
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
      return `${span}. Slipped ${sized(s, episode.change)}, then back. ${runs}`
    case 'slip-partly-back':
      return `${span}. Slipped ${sized(s, episode.change)}. Then up ${sized(s, episode.regained!)}. ${runs}`
    case 'slip-open':
      return episode.toMs === null
        ? `From ${span}. Slipped ${sized(s, episode.change)}, still lower in ${monthYear(years.toMs)}. ${runs}`
        : `${span}. Slipped ${sized(s, episode.change)}, stayed lower until it fell again. ${runs}`
    case 'improvement':
      return `${span}. Improved ${sized(s, episode.change)}. ${runs}`
    case 'after-break':
      return episodeSentence(episode, sport, years)
  }
}

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

/** What a sport's years lack, as one line with no counts: a library with none would otherwise read "You have 0 over 0". */
export function tooShortText(sport: Sport = 'run'): string {
  return `Not enough ${SAY[sport].steady} for a fitness history.`
}

/** The lead of the look-back as one sentence, in the reader's units. */
export function leadSentence(lead: Lead, lookBack: LookBack, system: UnitSystem): string {
  const sport = lookBack.sports[lead.sport]
  if (lead.kind === 'episode') {
    return episodeSentence(lead.episode, sport, sport.fitness as HindsightFitness, lead.held)
  }
  if (lead.kind === 'quiet') {
    const q = lead.stretch
    return `${upper(level(sport))} stayed within ${withinText(lead.sport, q.within)} from ${monthYear(q.fromMs)} to ${monthYear(q.toMs)}.`
  }
  const m = lead.best
  const set = `Best ${effortName(m.effort)}: ${bestValue(m, m.best.value, system)}, set on ${dayMonthYear(m.best.atMs)}.`
  const stood = stoodText(m.best.atMs, lookBack.asOfMs)
  return stood === '' ? set : `${set} ${stood}`
}
