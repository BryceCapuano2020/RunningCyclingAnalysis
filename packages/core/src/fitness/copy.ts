import { SPORT_ADAPTERS } from '../findings/adapters'
import { counted, formatDay, formatRelative } from '../findings/copy'
import type { Sport } from '../types'
import { formatPace, formatPower } from '../units'
import type { UnitSystem } from '../units'
import { FITNESS } from './params'
import type { FitnessStatus, Ranged, Shortfall } from './types'

const M = FITNESS.monitor

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
const month = (ms: number) => MONTHS[new Date(ms).getUTCMonth()]!

/**
 * A date names its year when it is not in the year the status is as of, so a change that began or a low that fell
 * in an earlier year reads unambiguously ("before 1 Aug 2022"), and a recent one stays short.
 */
const year = (ms: number, asOfMs: number) =>
  new Date(ms).getUTCFullYear() === new Date(asOfMs).getUTCFullYear()
    ? ''
    : ` ${new Date(ms).getUTCFullYear()}`
const dayOf = (ms: number, asOfMs: number) => `${formatDay(ms)}${year(ms, asOfMs)}`
const monthOf = (ms: number, asOfMs: number) => `${month(ms)}${year(ms, asOfMs)}`

/** How each sport's level and change are said: the verb, the words for less and more, and the level as the athlete's units write it. */
interface Words {
  verb: string
  less: string
  more: string
  /** What follows the amount in a sentence with no figure for the level itself. */
  tail: string
  steady: string
  level: (output: number, system: UnitSystem) => string
  /**
   * A change in output (0.1 is 10% more) as the athlete reads it. The page shows runs as paces, so a
   * run that goes from 5:00 to 5:30 /km is 10% slower though its speed fell by 9.1%; rides stay on power.
   * Monotone, so it maps the ends of a range as it maps the value, and it keeps the sign of the output.
   */
  shown: (change: number) => number
}

const WORDS: Record<Sport, Words> = {
  run: {
    verb: 'run',
    less: 'slower',
    more: 'faster',
    tail: '',
    steady: 'steady run',
    level: formatPace,
    shown: (change) => change / (1 + change),
  },
  ride: {
    verb: 'ride at',
    less: 'less',
    more: 'more',
    tail: ' power',
    steady: 'steady ride',
    level: (output) => formatPower(output),
    shown: (change) => change,
  },
}

/** A change and its range as the athlete reads them (see Words.shown): paces for a run, power for a ride. */
export function shownChange(sport: Sport, r: Ranged): Ranged {
  const f = WORDS[sport].shown
  return { value: f(r.value), low: f(r.low), high: f(r.high) }
}

/** Whether the whole range is on one side of level: only then is there a direction to say. */
export const oneSided = (r: Ranged): boolean => r.low > 0 || r.high < 0

/** The ends of a range as whole percentages, "3 to 9%"; one figure when they round together. */
const rangeText = (r: Ranged): string => {
  const [a, b] = [Math.abs(r.low), Math.abs(r.high)].sort((x, y) => x - y)
  const [lo, hi] = [Math.round(a! * 100), Math.round(b! * 100)]
  return lo === hi ? `${hi}%` : `${lo} to ${hi}%`
}

/** "6% (3 to 9%)": the size of a change and the range it may lie in. */
export const sized = (sport: Sport, r: Ranged) => {
  const shown = shownChange(sport, r)
  return `${formatRelative(shown.value)} (${rangeText(shown)})`
}

/** The side a change is on: "slower" or "faster" than the level it is against. */
const side = (w: Words, r: Ranged) => (r.value < 0 ? w.less : w.more)

/**
 * How far from level the runs allow the athlete to be, as a percentage in the athlete's terms: the log distance
 * read as a change each way (more speed or power, less), the larger side said, which for a run is the pace.
 */
export function withinText(sport: Sport, within: number): string {
  const f = WORDS[sport].shown
  return formatRelative(Math.max(Math.abs(f(Math.expm1(within))), Math.abs(f(Math.expm1(-within)))))
}

/** The month a change began, or the day the level before it ended. */
const before = (ms: number | null, asOfMs: number) =>
  ms === null ? '' : ` before ${dayOf(ms, asOfMs)}`

/** Whether the whole range is above the old level: the athlete is not only back but faster. */
const faster = (s: FitnessStatus) => s.change!.low > 0

/** The text of a shortfall, with its counts. */
function shortfallText(sport: Sport, s: Shortfall): string {
  const adapter = SPORT_ADAPTERS[sport]
  const w = WORDS[sport]
  const output = adapter.outputName[0]!.toUpperCase() + adapter.outputName.slice(1)
  switch (s.kind) {
    case 'history':
      return `Not enough evidence yet. ${output} at the same heart rate is read from ${s.need} ${w.steady}s over ${s.needWeeks} different weeks, from ${M.refEndWeeks} to ${M.refStartWeeks} weeks ago; there ${s.have === 1 ? 'is' : 'are'} ${counted(s.have, w.steady)} in ${counted(s.weeks, 'different week')}.`
    case 'recent':
      return `Not enough recent evidence yet. There ${s.have === 1 ? 'is' : 'are'} ${counted(s.have, w.steady)} in the last ${s.weeks} weeks; ${s.need} ${s.need === 1 ? 'is' : 'are'} needed.`
    case 'break':
      return `Not enough recent evidence yet. The last ${w.steady} was ${counted(s.weeksSince, 'week')} ago.`
    case 'imprecise':
      return `Not enough evidence yet. The ${w.steady}s so far leave ${adapter.outputName} at the same heart rate uncertain by about ${withinText(sport, s.within)}, too wide to call it level.`
    case 'unavailable':
      return `Not enough evidence yet. ${adapter.nounPlural[0]!.toUpperCase()}${adapter.nounPlural.slice(1)} are not compared at the same heart rate yet.`
  }
}

/** The support line: the runs in the recent stretch and, where there is one, the runs they are compared with. */
function support(s: FitnessStatus, against: string | null): string {
  const ev = s.evidence!
  const w = WORDS[s.sport]
  const recent = `${counted(ev.recent.runs, w.steady)}, ${formatDay(ev.recent.fromMs)} to ${formatDay(ev.recent.toMs)}`
  return against === null ? `${recent}.` : `${recent}, against ${against}.`
}

export interface FitnessLines {
  headline: string
  support: string
}

/**
 * The status in the athlete's units (pace per kilometre or mile, watts), as a headline with its range and
 * a line of the evidence behind it. A run's change is said in pace, as the page shows it. States the
 * change and the level; never what caused it.
 */
export function fitnessLines(s: FitnessStatus, system: UnitSystem): FitnessLines {
  const w = WORDS[s.sport]
  if (s.state === 'not-enough-evidence' || s.change === null || s.now === null) {
    return { headline: shortfallText(s.sport, s.shortfall!), support: '' }
  }
  const hr = `${s.referenceHr} bpm`
  const now = w.level(s.now, system)
  const was = w.level(s.before!, system)
  const since = before(s.onsetMs, s.asOfMs)
  const runs = s.evidence!.baseline?.runs
  const weeksBefore = (weeks: number) =>
    runs === undefined ? null : `${runs} in the ${weeks} weeks${since || ' before'}`
  const reference = M.refStartWeeks - M.refEndWeeks
  // A direction is said only when the whole range is on one side of level.
  const level = !oneSided(s.change)
  switch (s.state) {
    case 'slipping':
      return {
        headline: level
          ? `At ${hr} you now ${w.verb} ${now}, level with the ${was}${since} (within ${withinText(s.sport, s.within!)}).`
          : `At ${hr} you now ${w.verb} ${now}, ${sized(s.sport, s.change)} ${side(w, s.change)} than the ${was}${since}.`,
        support: support(s, weeksBefore(M.onsetBaseWeeks)),
      }
    case 'holding':
      return {
        headline: `At ${hr} you ${w.verb} ${now}, level with the ${reference} weeks before (within ${withinText(s.sport, s.within!)}).`,
        support: support(s, `${runs} in the ${reference} weeks before`),
      }
    case 'improving':
      return {
        headline: `At ${hr} you now ${w.verb} ${now}, ${sized(s.sport, s.change)} ${side(w, s.change)} than the ${was} in the ${reference} weeks before.`,
        support: support(s, `${runs} in the ${reference} weeks before`),
      }
    case 'holding-below':
      return {
        headline: level
          ? `At ${hr} you ${w.verb} ${now}, level with the ${was}${since} (within ${withinText(s.sport, s.within!)}).`
          : `At ${hr} you ${w.verb} ${now}, holding ${sized(s.sport, s.change)} ${side(w, s.change)} than the ${was}${since}.`,
        support: support(s, null),
      }
    case 'recovering': {
      const regained = oneSided(s.gain!) ? `regained ${sized(s.sport, s.gain!)}` : 'regained ground'
      return {
        headline: level
          ? `At ${hr} you have ${regained} since your low in ${monthOf(s.lowMs!, s.asOfMs)}: ${now}, level with the ${was}${since} (within ${withinText(s.sport, s.within!)}).`
          : `At ${hr} you have ${regained} since your low in ${monthOf(s.lowMs!, s.asOfMs)}: ${now}, ${s.change.value < 0 ? 'still' : 'now'} ${sized(s.sport, s.change)} ${side(w, s.change)} than the ${was}${since}.`,
        support: support(s, null),
      }
    }
    case 'back':
      return {
        headline: faster(s)
          ? `At ${hr} you are back and ${w.more}: ${now} against ${was}${since}, ${sized(s.sport, s.change)} ${w.more}.`
          : `At ${hr} you are back: ${now} against ${was}${since}, within ${withinText(s.sport, s.within!)}.`,
        support: support(s, null),
      }
  }
}

/**
 * The headline of a finding, with no pace or power in it: a finding is kept in the ledger and the
 * athlete's unit setting can change after it is made, so it carries sizes and dates only.
 */
export function fitnessFindingHeadline(s: FitnessStatus): string {
  const w = WORDS[s.sport]
  const hr = `${s.referenceHr} bpm`
  const since = before(s.onsetMs, s.asOfMs)
  switch (s.state) {
    case 'slipping':
      return `At ${hr} you now ${w.verb} ${sized(s.sport, s.change!)} ${side(w, s.change!)}${w.tail}${since ? ` than${since}` : ''}.`
    case 'recovering':
      return `At ${hr} you have ${oneSided(s.gain!) ? `regained ${sized(s.sport, s.gain!)}` : 'regained ground'} since your low in ${monthOf(s.lowMs!, s.asOfMs)}.`
    case 'back':
      return faster(s)
        ? `At ${hr} you are back and ${sized(s.sport, s.change!)} ${w.more}${since ? ` than${since}` : ''}.`
        : `At ${hr} you are back to your level${since}, within ${withinText(s.sport, s.within!)}.`
    default:
      return ''
  }
}
