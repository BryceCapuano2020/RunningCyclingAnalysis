import { counted } from '../findings/copy'
import { withinText } from '../fitness/copy'
import type { FitnessState } from '../fitness/types'
import type { Sport } from '../types'
import { paceSeconds } from '../units'
import type { UnitSystem } from '../units'
import type { CheckIn, FitnessLine, NewBest, NewEpisode } from './checkIn'
import {
  bestValue,
  dayMonthYear,
  effortName,
  localDayMonthYear,
  monthYear,
  monthsBetween,
} from './copy'

/**
 * The words of "since your last import". Plain, in the reader's voice, every date with its year; a line says what
 * happened, never why.
 */

/** The most lines under the headline. */
const MOST_LINES = 3

const NOUN: Record<Sport, [string, string]> = { run: ['run', 'runs'], ride: ['ride', 'rides'] }
const FITNESS_NAME: Record<Sport, string> = { run: 'Run fitness', ride: 'Ride fitness' }

/** A state as it reads after "is" or "was". */
const STATE: Record<FitnessState, string> = {
  slipping: 'slipping',
  holding: 'holding',
  'holding-below': 'holding below your old level',
  recovering: 'recovering',
  back: 'back',
  improving: 'improving',
  improved: 'improved',
  'not-enough-evidence': 'not yet readable',
}

/** A state that has not changed, as it reads after "is" with "as at your last import". */
const STILL: Record<FitnessState, string> = {
  ...STATE,
  slipping: 'still slipping',
  'holding-below': 'still holding below your old level',
  recovering: 'still recovering',
  back: 'staying at your old level',
  improving: 'still improving',
  improved: 'still improved',
}

const lower = (text: string) => `${text[0]!.toLowerCase()}${text.slice(1)}`

/** "14 runs and 3 rides", leaving out a sport with none; empty when there are none. */
function addedText(added: CheckIn['added']): string {
  return (['run', 'ride'] as const)
    .filter((s) => added[s] > 0)
    .map((s) => counted(added[s], ...NOUN[s]))
    .join(' and ')
}

/** How much better a new best is, in the units the page writes it: "3 s faster", "6 W higher". Empty when the page's rounding shows none. */
function betterBy(best: NewBest, system: UnitSystem): string {
  switch (best.unit) {
    case 'm/s': {
      const seconds =
        Math.round(paceSeconds(best.previous, system)) - Math.round(paceSeconds(best.value, system))
      return seconds > 0 ? `${seconds} s faster` : ''
    }
    case 's': {
      const seconds = Math.round(best.previous) - Math.round(best.value)
      return seconds > 0 ? `${seconds} s faster` : ''
    }
    case 'W': {
      const watts = Math.round(best.value) - Math.round(best.previous)
      return watts > 0 ? `${watts} W higher` : ''
    }
    case 'W/kg':
      return `${(best.value - best.previous).toFixed(2)} W/kg higher`
  }
}

function bestLine(best: NewBest, system: UnitSystem): string {
  const name = `${effortName(best.effort)} ${NOUN[best.sport][0]}`
  const value = bestValue(best, best.value, system)
  if (best.older)
    return `Found in older files: your best ${name} is ${value}, from ${new Date(best.atMs).getUTCFullYear()}.`
  const by = betterBy(best, system)
  return `New best ${name}: ${value}${by === '' ? '' : `, ${by} than before`}, set on ${dayMonthYear(best.atMs)}.`
}

function fitnessLine(line: FitnessLine): string {
  const name = FITNESS_NAME[line.sport]
  switch (line.kind) {
    case 'moved':
      return line.from === 'not-enough-evidence'
        ? `${name} could not be read at your last import; it is ${STATE[line.to]} now.`
        : `${name} was ${STATE[line.from]} at your last import; it is ${STATE[line.to]} now.`
    case 'began':
      return `${name} has been ${STATE[line.state]} since ${monthYear(line.sinceMs)}.`
    case 'same':
      return line.within === null
        ? `${name} is ${STILL[line.state]}, as at your last import.`
        : `${name} is ${STILL[line.state]}, as at your last import: no clear change, within ${withinText(line.sport, line.within)} of before.`
  }
}

const A: Record<NewEpisode['kind'], string> = {
  'slip-back': 'a slip',
  'slip-partly-back': 'a slip',
  'slip-open': 'a slip',
  improvement: 'an improvement',
  'after-break': 'a step after a break',
}

function episodeLine(e: NewEpisode): string {
  const span = e.toMs === null ? `from ${monthYear(e.fromMs)}` : monthsBetween(e.fromMs, e.toMs)
  return `Older files added ${A[e.kind]} to your ${NOUN[e.sport][0]} years: ${span}.`
}

/** The older files an import filled in: "Found in older files: 120 runs from 2019 to 2021." */
function olderLine(sport: Sport, older: NonNullable<CheckIn['older'][Sport]>): string {
  const [from, to] = [
    new Date(older.fromMs).getUTCFullYear(),
    new Date(older.toMs).getUTCFullYear(),
  ]
  const years = from === to ? `${from}` : `${from} to ${to}`
  return `Found in older files: ${counted(older.count, ...NOUN[sport])} from ${years}.`
}

/** The clause of the one-line check-in for a sport's fitness: "run fitness shows no clear change, within 2% of before". */
function quietClause(line: FitnessLine): string {
  const name = lower(FITNESS_NAME[line.sport])
  if (line.kind !== 'same') return ''
  return line.within === null
    ? `${name} is ${STILL[line.state]}`
    : `${name} shows no clear change, within ${withinText(line.sport, line.within)} of before`
}

export interface CheckInText {
  /** The region's one line: the whole check-in when quiet, else what was added. */
  headline: string
  /** What else the import told, most important first: the card's change, then bests, then older files. */
  lines: string[]
}

/** The check-in as words, with paces in the reader's units. */
export function checkInText(checkIn: CheckIn, system: UnitSystem): CheckInText {
  const since = localDayMonthYear(checkIn.sinceMs)
  const added = addedText(checkIn.added)
  if (checkIn.quiet) {
    const clauses = checkIn.fitness.map(quietClause).filter((c) => c !== '')
    const checked = clauses.length === 0 ? '.' : `, and ${clauses.join(' and ')}.`
    return {
      headline: `${added === '' ? 'Nothing added' : `${added} added`} since ${since}. Nothing moved: no new bests${checked}`,
      lines: [],
    }
  }
  const moved = checkIn.fitness.filter((l) => l.kind !== 'same')
  const quoted = checkIn.fitness.filter((l) => l.kind === 'same')
  const older = (['run', 'ride'] as const).flatMap((s) => {
    const span = checkIn.older[s]
    return span === null ? [] : [olderLine(s, span)]
  })
  const lines = [
    ...moved.map(fitnessLine),
    ...checkIn.bests.map((b) => bestLine(b, system)),
    ...checkIn.episodes.map(episodeLine),
    ...older,
    ...quoted.map(fitnessLine),
  ].slice(0, MOST_LINES)
  return {
    headline: `Since ${since}: ${added === '' ? 'nothing added' : `${added} added`}.`,
    lines,
  }
}
