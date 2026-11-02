import { SPORT_ADAPTERS } from '../findings/adapters'
import { counted, formatDay, formatRelative } from '../findings/copy'
import type { Sport } from '../types'
import { formatPace, formatPaceValue, formatPower, formatWatts } from '../units'
import type { UnitSystem } from '../units'
import { FITNESS } from './params'
import type { FitnessStatus, Ranged, Shortfall, SpokenState } from './types'

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
 * A date names its year when it is not in the year the status is as of, so a low that fell in an earlier year reads
 * unambiguously ("July 2024"), and a recent one stays short.
 */
const yearOf = (ms: number) => new Date(ms).getUTCFullYear()
const yearIn = (ms: number, asOfMs: number) =>
  yearOf(ms) === yearOf(asOfMs) ? '' : ` ${yearOf(ms)}`
const monthOf = (ms: number, asOfMs: number) => `${month(ms)}${yearIn(ms, asOfMs)}`

/** How each sport's level and change are said: the verb, the words for less and more, and the level as the athlete's units write it. */
interface Words {
  less: string
  more: string
  /** What follows the amount in a sentence with no figure for the level itself. */
  tail: string
  steady: string
  level: (output: number, system: UnitSystem) => string
  /** The ends of a range of output, as numbers and in the order the athlete reads them: a run's faster pace comes first. */
  range: (low: number, high: number, system: UnitSystem) => string
  /** The one line for a sport with fewer than three steady activities, `have` of them so far. */
  none: (have: number) => string
  /**
   * A change in output (0.1 is 10% more) as the athlete reads it. The page shows runs as paces, so a
   * run that goes from 5:00 to 5:30 /km is 10% slower though its speed fell by 9.1%; rides stay on power.
   * Monotone, so it maps the ends of a range as it maps the value, and it keeps the sign of the output.
   */
  shown: (change: number) => number
}

const WORDS: Record<Sport, Words> = {
  run: {
    less: 'slower',
    more: 'faster',
    tail: '',
    steady: 'steady run',
    level: formatPace,
    range: (low, high, system) =>
      `${formatPaceValue(high, system)} to ${formatPaceValue(low, system)}`,
    none: (have) =>
      have === 0
        ? 'No steady runs with heart rate yet.'
        : `${counted(have, 'steady run')} with heart rate so far.`,
    shown: (change) => change / (1 + change),
  },
  ride: {
    less: 'less',
    more: 'more',
    tail: ' power',
    steady: 'steady ride',
    level: (output) => formatPower(output),
    range: (low, high) => `${formatWatts(low)} to ${formatWatts(high)}`,
    none: (have) =>
      have === 0
        ? 'No steady rides with a power meter yet.'
        : `${counted(have, 'steady ride')} with a power meter so far.`,
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

/** A size as the athlete reads it: whole percentages, and a tenth under 1% so a small change does not read as none. */
const percent = (fraction: number): string => {
  const size = Math.abs(fraction) * 100
  return `${size < 1 ? Number(size.toFixed(1)) : Math.round(size)}%`
}

/**
 * The ends of a range as whole percentages, "3 to 9"; nothing when they round together. A range on one side of
 * level is written as sizes, the words beside it giving the direction. One that crosses level keeps its signs
 * ("-3 to +4"), since its ends lie on different sides and sizes alone would say the same of both.
 */
const rangeText = (r: Ranged): string => {
  const [lo, hi] = [Math.round(r.low * 100), Math.round(r.high * 100)]
  if (oneSided(r)) {
    const [a, b] = [Math.abs(lo), Math.abs(hi)].sort((x, y) => x - y)
    return a === b ? '' : `${a} to ${b}`
  }
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  return lo === hi ? '' : `${signed(lo)} to ${signed(hi)}`
}

/** "6% (3 to 9)": the size of a change and the range it may lie in, the range left out when it rounds to the size. */
export const sized = (sport: Sport, r: Ranged) => {
  const shown = shownChange(sport, r)
  const range = rangeText(shown)
  return `${percent(shown.value)}${range === '' ? '' : ` (${range})`}`
}

/**
 * How far from level the runs allow the athlete to be, as a percentage in the athlete's terms: the log distance
 * read as a change each way (more speed or power, less), the larger side said, which for a run is the pace.
 */
export function withinText(sport: Sport, within: number): string {
  const f = WORDS[sport].shown
  return formatRelative(Math.max(Math.abs(f(Math.expm1(within))), Math.abs(f(Math.expm1(-within)))))
}

/** The year a date falls in, as the status reads it. */
const sameYear = (ms: number, asOfMs: number) => yearOf(ms) === yearOf(asOfMs)

/**
 * The level a change is against: "your 2019 level" for one that ended in an earlier year, "your level before 28 Feb"
 * in the status's own year, and "your old level" when its end is not dated. A finding is kept, so it names the day:
 * "your level before 28 Feb 2019".
 */
function oldLevel(s: FitnessStatus, dated = false): string {
  if (s.onsetMs === null) return 'your old level'
  if (dated) return `your level before ${formatDay(s.onsetMs)}${yearIn(s.onsetMs, s.asOfMs)}`
  return sameYear(s.onsetMs, s.asOfMs)
    ? `your level before ${formatDay(s.onsetMs)}`
    : `your ${yearOf(s.onsetMs)} level`
}

/** The low a recovery rose from: "your 2020 low", or "your July low" in the status's own year; a finding says "your low in July 2020". */
const lowName = (s: FitnessStatus, dated = false) =>
  dated
    ? `your low in ${monthOf(s.lowMs!, s.asOfMs)}`
    : `your ${sameYear(s.lowMs!, s.asOfMs) ? month(s.lowMs!) : yearOf(s.lowMs!)} low`

/** Whether the whole range is above the old level: the athlete is not only back but faster. */
const faster = (s: FitnessStatus) => s.change!.low > 0

/** A level the range allows no direction for: "At your 2019 level, within 4.6%". */
const atLevel = (s: FitnessStatus, dated = false) =>
  `At ${oldLevel(s, dated)}, within ${withinText(s.sport, s.within!)}`

/** The size of a change against the old level, or the level itself when its range crosses it; no full stop. */
function against(s: FitnessStatus, dated = false): string {
  const w = WORDS[s.sport]
  const change = s.change!
  if (!oneSided(change)) return atLevel(s, dated)
  const size = sized(s.sport, change)
  return change.value < 0
    ? `${size} off ${oldLevel(s, dated)}`
    : `${size} ${w.more}${w.tail} than ${oldLevel(s, dated)}`
}

/** What a trend needs, from the counts a shortfall holds, in the sport's own words: one short line. */
function needsText(sport: Sport, s: Shortfall): string {
  const adapter = SPORT_ADAPTERS[sport]
  const w = WORDS[sport]
  const earlier = `More earlier ${adapter.nounPlural} to see a trend.`
  switch (s.kind) {
    case 'history':
      if (s.have < s.need) {
        return `${counted(s.need - s.have, `more earlier ${adapter.noun}`)} to see a trend.`
      }
      return s.weeks < s.needWeeks
        ? `Earlier ${adapter.nounPlural} in ${counted(s.needWeeks - s.weeks, 'more week')} to see a trend.`
        : earlier
    case 'recent':
      return s.have < s.need
        ? `${counted(s.need - s.have, `more ${adapter.noun}`)} in the last ${s.weeks} weeks to see a trend.`
        : earlier
    case 'break':
      return `A ${w.steady} in the last ${FITNESS.display.breakWeeks} weeks to see a trend.`
    case 'imprecise':
      return `More ${w.steady}s narrow the range to see a trend.`
    case 'unavailable':
      return ''
  }
}

export interface FitnessLines {
  /** The level, number first: "5:30 /km at 150 bpm." */
  headline: string
  /** One line for each change, number first; empty for a status that cannot call a trend. */
  changes: string[]
  /** The steady activities the level rests on. */
  support: string
  /** What a trend needs, for a status that cannot call one; empty otherwise. */
  needs: string
}

/**
 * A status that cannot call a trend: the level it does have, with its range, at the max heart rate it is taken at (dated
 * when the sport is on a break), the steady activities it rests on and what a trend needs; with fewer than three steady
 * activities, one line saying so.
 */
function waitingLines(s: FitnessStatus, system: UnitSystem): FitnessLines {
  const w = WORDS[s.sport]
  if (s.shortfall!.kind === 'unavailable') {
    return { headline: 'Not enough evidence yet.', changes: [], support: '', needs: '' }
  }
  const level = s.level
  if (level === undefined) {
    return { headline: w.none(s.steady), changes: [], support: '', needs: '' }
  }
  const on = s.shortfall!.kind === 'break' ? ` in ${monthOf(level.toMs, s.asOfMs)}` : ''
  return {
    headline: `${w.level(level.value, system)} (${w.range(level.low, level.high, system)}) at ${s.referenceHr} bpm${on}.`,
    changes: [],
    support: `From ${counted(level.runs, w.steady)}.`,
    needs: needsText(s.sport, s.shortfall!),
  }
}

/** The support line: the steady activities in the recent stretch, with the days they span. */
function support(s: FitnessStatus): string {
  const { recent } = s.evidence!
  return `From ${counted(recent.runs, WORDS[s.sport].steady)}, ${formatDay(recent.fromMs)} to ${formatDay(recent.toMs)}.`
}

/** A status that calls a state: it has a change and a level to say. */
type Spoken = FitnessStatus & { state: SpokenState; change: Ranged; now: number }

const isSpoken = (s: FitnessStatus): s is Spoken =>
  s.state !== 'not-enough-evidence' && s.change !== null && s.now !== null

/**
 * The status in the athlete's units (pace per kilometre or mile, watts): the level first, then a line for each change
 * with its range, then the evidence behind it. A run's change is said in pace, as the page shows it. States the
 * change and the level; never what caused it.
 */
export function fitnessLines(s: FitnessStatus, system: UnitSystem): FitnessLines {
  return isSpoken(s) ? spokenLines(s, system) : waitingLines(s, system)
}

function spokenLines(s: Spoken, system: UnitSystem): FitnessLines {
  const headline = `${WORDS[s.sport].level(s.now, system)} at ${s.referenceHr} bpm.`
  return {
    headline,
    changes: changesOf(s).map((line) => `${line}.`),
    support: support(s),
    needs: '',
  }
}

/** One line for each change a state tells, without its full stop. */
function changesOf(s: Spoken): string[] {
  switch (s.state) {
    case 'holding': {
      const weeks = M.refStartWeeks - M.refEndWeeks
      return [`Level with the ${weeks} weeks before, within ${withinText(s.sport, s.within!)}`]
    }
    case 'recovering': {
      const up = oneSided(s.gain!) ? `Up ${sized(s.sport, s.gain!)}` : 'Up'
      return [`${up} from ${lowName(s)}`, against(s)]
    }
    case 'back':
      return [faster(s) ? against(s) : atLevel(s)]
    default:
      return [against(s)]
  }
}

/**
 * The headline of a finding, with no pace or power in it: a finding is kept in the ledger and the
 * athlete's unit setting can change after it is made, so it carries sizes and dates only.
 */
export function fitnessFindingHeadline(s: FitnessStatus): string {
  const at = ` at ${s.referenceHr} bpm`
  switch (s.state) {
    case 'slipping':
    case 'improved':
      return `${against(s, true)}${at}.`
    case 'recovering':
      return `${oneSided(s.gain!) ? `Up ${sized(s.sport, s.gain!)}` : 'Up'} from ${lowName(s, true)}${at}.`
    case 'back':
      return faster(s)
        ? `Back and ${against(s, true)}${at}.`
        : `Back at ${oldLevel(s, true)}${at}, within ${withinText(s.sport, s.within!)}.`
    default:
      return ''
  }
}
