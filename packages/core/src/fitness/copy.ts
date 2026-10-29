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

/** How each sport's level and change are said: the verb, the words for less and more, and the level as the athlete's units write it. */
interface Words {
  verb: string
  less: string
  more: string
  /** What follows the amount in a sentence with no figure for the level itself. */
  tail: string
  steady: string
  level: (output: number, system: UnitSystem) => string
}

const WORDS: Record<Sport, Words> = {
  run: {
    verb: 'run',
    less: 'slower',
    more: 'faster',
    tail: '',
    steady: 'steady run',
    level: formatPace,
  },
  ride: {
    verb: 'ride at',
    less: 'less',
    more: 'more',
    tail: ' power',
    steady: 'steady ride',
    level: (output) => formatPower(output),
  },
}

/** The ends of a range as whole percentages, "3 to 9%"; one figure when they round together. */
const rangeText = (r: Ranged): string => {
  const [a, b] = [Math.abs(r.low), Math.abs(r.high)].sort((x, y) => x - y)
  const [lo, hi] = [Math.round(a! * 100), Math.round(b! * 100)]
  return lo === hi ? `${hi}%` : `${lo} to ${hi}%`
}

/** "6% (3 to 9%)": the size of a change and the range it may lie in. */
const sized = (r: Ranged) => `${formatRelative(r.value)} (${rangeText(r)})`

/** The side a change is on: "slower" or "faster" than the level it is against. */
const side = (w: Words, r: Ranged) => (r.value < 0 ? w.less : w.more)

/** The text of a shortfall, with its counts. */
function shortfallText(sport: Sport, s: Shortfall): string {
  const adapter = SPORT_ADAPTERS[sport]
  const w = WORDS[sport]
  const output = adapter.outputName[0]!.toUpperCase() + adapter.outputName.slice(1)
  switch (s.kind) {
    case 'history':
      return `Not enough evidence yet. ${output} at the same heart rate needs ${s.need} ${w.steady}s over ${s.needWeeks} different weeks before the last ${FITNESS.monitor.refEndWeeks}; there ${s.have === 1 ? 'is' : 'are'} ${s.have}.`
    case 'recent':
      return `Not enough recent evidence yet. There ${s.have === 1 ? 'is' : 'are'} ${counted(s.have, w.steady)} in the last ${s.weeks} weeks; ${s.need} ${s.need === 1 ? 'is' : 'are'} needed.`
    case 'break':
      return `Not enough recent evidence yet. The last ${w.steady} was ${counted(s.weeksSince, 'week')} ago.`
    case 'imprecise':
      return `Not enough evidence yet. ${output} at the same heart rate is known only to within ${formatRelative(s.within)} so far.`
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
 * a line of the evidence behind it. States the change and the level; never what caused it.
 */
export function fitnessLines(s: FitnessStatus, system: UnitSystem): FitnessLines {
  const w = WORDS[s.sport]
  if (s.state === 'not-enough-evidence' || s.change === null || s.now === null) {
    return { headline: shortfallText(s.sport, s.shortfall!), support: '' }
  }
  const hr = `${s.referenceHr} bpm`
  const now = w.level(s.now, system)
  const before = w.level(s.before!, system)
  const since = s.onsetMs === null ? '' : ` before ${month(s.onsetMs)}`
  const runs = s.evidence!.baseline?.runs
  const weeksBefore = (weeks: number) =>
    runs === undefined ? null : `${runs} in the ${weeks} weeks${since || ' before'}`
  switch (s.state) {
    case 'slipping':
      return {
        headline: `At ${hr} you now ${w.verb} ${now}, ${sized(s.change)} ${side(w, s.change)} than the ${before}${since}.`,
        support: support(s, weeksBefore(M.onsetBaseWeeks)),
      }
    case 'holding':
      return {
        headline: `At ${hr} you ${w.verb} ${now}, level with the ${M.refStartWeeks - M.refEndWeeks} weeks before (within ${formatRelative(Math.max(s.within!, 0.02))}).`,
        support: support(s, `${runs} in the ${M.refStartWeeks - M.refEndWeeks} weeks before`),
      }
    case 'holding-below':
      return {
        headline: `At ${hr} you ${w.verb} ${now}, holding ${sized(s.change)} ${side(w, s.change)} than the ${before}${since}.`,
        support: support(s, null),
      }
    case 'recovering':
      return {
        headline: `At ${hr} you have regained ${sized(s.gain!)} since your low in ${month(s.lowMs!)}: ${now}, still ${sized(s.change)} ${side(w, s.change)} than the ${before}${since}.`,
        support: support(s, null),
      }
    case 'back':
      return {
        headline: `At ${hr} you are back: ${now} against ${before}${since}, within ${formatRelative(Math.max(s.within!, 0.02))}.`,
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
  const since = s.onsetMs === null ? '' : ` than before ${month(s.onsetMs)}`
  switch (s.state) {
    case 'slipping':
      return `At ${hr} you now ${w.verb} ${sized(s.change!)} ${side(w, s.change!)}${w.tail}${since}.`
    case 'recovering':
      return `At ${hr} you have regained ${sized(s.gain!)} since your low in ${month(s.lowMs!)}.`
    case 'back':
      return `At ${hr} you are back to your level${s.onsetMs === null ? '' : ` before ${month(s.onsetMs)}`}, within ${formatRelative(Math.max(s.within!, 0.02))}.`
    default:
      return ''
  }
}
