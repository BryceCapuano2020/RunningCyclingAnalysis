import { SPORT_ADAPTERS } from '../findings/adapters'
import { counted, formatDay, formatRelative } from '../findings/copy'
import type { Sport } from '../types'
import { PACE_UNIT, formatPace, formatPaceValue, formatPower, formatWatts } from '../units'
import type { UnitSystem } from '../units'
import { FITNESS } from './params'
import type { FitnessStatus, Ranged, Shortfall, SpokenState } from './types'
import { MONTH_NAMES } from '../calendar'

const month = (ms: number) => MONTH_NAMES[new Date(ms).getUTCMonth()]!

/**
 * A date names its year when it is not in the year the status is as of, so a low that fell in an earlier year reads
 * unambiguously ("July 2024"), and a recent one stays short.
 */
const yearOf = (ms: number) => new Date(ms).getUTCFullYear()
const yearIn = (ms: number, asOfMs: number) =>
  yearOf(ms) === yearOf(asOfMs) ? '' : ` ${yearOf(ms)}`
const monthOf = (ms: number, asOfMs: number) => `${month(ms)}${yearIn(ms, asOfMs)}`

/** How each sport's level is said, in the athlete's units. */
interface Words {
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

/**
 * How far from level the runs allow the athlete to be, as a percentage in the athlete's terms: the log distance
 * read as a change each way (more speed or power, less), the larger side said, which for a run is the pace.
 */
export function withinText(sport: Sport, within: number): string {
  const f = WORDS[sport].shown
  return formatRelative(Math.max(Math.abs(f(Math.expm1(within))), Math.abs(f(Math.expm1(-within)))))
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

/** The figures a status prints, as text in the athlete's units: the level, its range and the steady activities behind it. */
export interface FitnessFigures {
  /** The level now, or the level a status that cannot call a trend has; null with neither. */
  level: string | null
  /** The level's range, "194 to 206 W" (a run's faster pace first); null without a level. */
  range: string | null
  /** The month a break's level was taken in, "October", or null when the sport is not on a break. */
  month: string | null
  /** The unit the range is in, "/km" or "W". */
  unit: string
  /** The steady activities the level rests on; null with none. */
  steady: number | null
}

/** The unit a range is in, by sport. */
const UNIT: Record<Sport, (system: UnitSystem) => string> = {
  run: (system) => PACE_UNIT[system],
  ride: () => 'W',
}

/** One source for the figures of the lines and of the Details rows: the status's level, range and steady count. */
export function fitnessFigures(s: FitnessStatus, system: UnitSystem): FitnessFigures {
  const w = WORDS[s.sport]
  const level = s.level
  const spoken = isSpoken(s)
  return {
    level: spoken
      ? w.level(s.now, system)
      : level === undefined
        ? null
        : w.level(level.value, system),
    range: level === undefined ? null : w.range(level.low, level.high, system),
    month:
      s.shortfall?.kind === 'break' && level !== undefined ? monthOf(level.toMs, s.asOfMs) : null,
    unit: UNIT[s.sport](system),
    steady: spoken ? (s.evidence?.recent.runs ?? null) : (level?.runs ?? null),
  }
}

export interface FitnessLines {
  /** The level, number first: "5:30 /km at 150 bpm." */
  headline: string
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
    return { headline: 'Not enough evidence yet.', support: '', needs: '' }
  }
  const level = s.level
  if (level === undefined) {
    return { headline: w.none(s.steady), support: '', needs: '' }
  }
  const figures = fitnessFigures(s, system)
  const on = figures.month === null ? '' : ` in ${figures.month}`
  return {
    headline: `${figures.level} (${figures.range}) at ${s.referenceHr} bpm${on}.`,
    support: `From ${counted(figures.steady!, w.steady)}.`,
    needs: needsText(s.sport, s.shortfall!),
  }
}

/** The support line: the steady activities in the recent stretch, with the days they span. */
function support(s: FitnessStatus, system: UnitSystem): string {
  const { recent } = s.evidence!
  return `From ${counted(fitnessFigures(s, system).steady!, WORDS[s.sport].steady)}, ${formatDay(recent.fromMs)} to ${formatDay(recent.toMs)}.`
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
  const headline = `${fitnessFigures(s, system).level} at ${s.referenceHr} bpm.`
  return {
    headline,
    support: support(s, system),
    needs: '',
  }
}
