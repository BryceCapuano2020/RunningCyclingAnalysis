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
 * "Since your last import" as label and value rows, every date with its year: what happened, never why. Nothing here
 * is a sentence; the page sets each row's label over its figure.
 */

/** The most lines under the headline. */
const MOST_LINES = 3

const NOUN: Record<Sport, [string, string]> = { run: ['run', 'runs'], ride: ['ride', 'rides'] }
const FITNESS_NAME: Record<Sport, string> = { run: 'Run fitness', ride: 'Ride fitness' }

/** A state as a figure: the value of a fitness row. */
const STATE: Record<FitnessState, string> = {
  slipping: 'Slipping',
  holding: 'Holding',
  'holding-below': 'Holding below your old level',
  recovering: 'Recovering',
  back: 'Back',
  improving: 'Improving',
  improved: 'Improved',
  'not-enough-evidence': 'No trend',
}

/** A state that has not changed. */
const STILL: Record<FitnessState, string> = {
  ...STATE,
  slipping: 'Still slipping',
  'holding-below': 'Still holding below your old level',
  recovering: 'Still recovering',
  back: 'At your old level',
  improving: 'Still improving',
  improved: 'Still improved',
}

/** One row: a label over its value, with an optional second reading beside it ("3 s faster than before"). */
export interface CheckInFigure {
  label: string
  value: string
  detail?: string
}

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

function bestRow(best: NewBest, system: UnitSystem): CheckInFigure {
  const name = `${effortName(best.effort)} ${NOUN[best.sport][0]}`
  const value = bestValue(best, best.value, system)
  if (best.older)
    return {
      label: `Best ${name}`,
      value,
      detail: `Older files, ${new Date(best.atMs).getUTCFullYear()}`,
    }
  const by = betterBy(best, system)
  const set = dayMonthYear(best.atMs)
  return {
    label: `New best ${name}`,
    value,
    detail: by === '' ? set : `${by} than before, ${set}`,
  }
}

function fitnessRow(line: FitnessLine): CheckInFigure {
  const label = FITNESS_NAME[line.sport]
  switch (line.kind) {
    case 'moved':
      return { label, value: STATE[line.to], detail: `Was ${STATE[line.from].toLowerCase()}` }
    case 'began':
      return { label, value: STATE[line.state], detail: `Since ${monthYear(line.sinceMs)}` }
    case 'same':
      return {
        label,
        value: STILL[line.state],
        ...(line.within === null
          ? {}
          : { detail: `Within ${withinText(line.sport, line.within)}` }),
      }
  }
}

/** The same row for a quiet check-in, where a fitness that did not move reads as no clear change. */
function quietRow(line: FitnessLine): CheckInFigure | null {
  if (line.kind !== 'same') return null
  return line.within === null
    ? fitnessRow(line)
    : {
        label: FITNESS_NAME[line.sport],
        value: 'No clear change',
        detail: `Within ${withinText(line.sport, line.within)}`,
      }
}

const A: Record<NewEpisode['kind'], string> = {
  'slip-back': 'Slip',
  'slip-partly-back': 'Slip',
  'slip-open': 'Slip',
  improvement: 'Improvement',
  'after-break': 'Step after a break',
}

function episodeRow(e: NewEpisode): CheckInFigure {
  const span = e.toMs === null ? monthYear(e.fromMs) : monthsBetween(e.fromMs, e.toMs)
  return { label: `${A[e.kind]} in older ${NOUN[e.sport][1]}`, value: span }
}

/** The older files an import filled in: "Runs in older files" over "120", with the years beside it. */
function olderRow(sport: Sport, older: NonNullable<CheckIn['older'][Sport]>): CheckInFigure {
  const [from, to] = [
    new Date(older.fromMs).getUTCFullYear(),
    new Date(older.toMs).getUTCFullYear(),
  ]
  return {
    label: `${upperFirst(NOUN[sport][1])} in older files`,
    value: String(older.count),
    detail: from === to ? `${from}` : `${from} to ${to}`,
  }
}

const upperFirst = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

export interface CheckInText {
  /** The region's one line: what was added since the last import, as a label over its value. */
  headline: CheckInFigure
  /** What else the import told, most important first: the card's change, then bests, then older files. */
  rows: CheckInFigure[]
}

/** The check-in as label and value rows, with paces in the reader's units. */
export function checkInText(checkIn: CheckIn, system: UnitSystem): CheckInText {
  const added = addedText(checkIn.added)
  const headline = {
    label: `Added since ${localDayMonthYear(checkIn.sinceMs)}`,
    value: added === '' ? 'Nothing' : added,
  }
  if (checkIn.quiet) {
    const quiet = checkIn.fitness.map(quietRow).filter((row) => row !== null)
    return { headline, rows: [{ label: 'Fitness moved', value: 'Nothing' }, ...quiet] }
  }
  const moved = checkIn.fitness.filter((l) => l.kind !== 'same')
  const quoted = checkIn.fitness.filter((l) => l.kind === 'same')
  const older = (['run', 'ride'] as const).flatMap((s) => {
    const span = checkIn.older[s]
    return span === null ? [] : [olderRow(s, span)]
  })
  const rows = [
    ...moved.map(fitnessRow),
    ...checkIn.bests.map((b) => bestRow(b, system)),
    ...checkIn.episodes.map(episodeRow),
    ...older,
    ...quoted.map(fitnessRow),
  ].slice(0, MOST_LINES)
  return { headline, rows }
}
