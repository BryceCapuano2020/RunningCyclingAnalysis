import { counted } from '../findings/copy'
import type { Sport } from '../types'
import { paceSeconds } from '../units'
import type { UnitSystem } from '../units'
import type { CheckIn, NewBest } from './checkIn'
import { bestValue, dayMonthYear, effortName, localDayMonthYear } from './copy'

/**
 * "Since your last import" as label and value rows, every date with its year: what happened, never why. Nothing here
 * is a sentence; the page sets each row's label over its figure.
 */

/** The most lines under the headline. */
const MOST_LINES = 3

const NOUN: Record<Sport, [string, string]> = { run: ['run', 'runs'], ride: ['ride', 'rides'] }

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
  /** What else the import told, most important first: bests, then older files. */
  rows: CheckInFigure[]
}

/** The check-in as label and value rows, with paces in the reader's units. */
export function checkInText(checkIn: CheckIn, system: UnitSystem): CheckInText {
  const added = addedText(checkIn.added)
  const headline = {
    label: `Added since ${localDayMonthYear(checkIn.sinceMs)}`,
    value: added === '' ? 'Nothing' : added,
  }
  const older = (['run', 'ride'] as const).flatMap((s) => {
    const span = checkIn.older[s]
    return span === null ? [] : [olderRow(s, span)]
  })
  const rows = [...checkIn.bests.map((b) => bestRow(b, system)), ...older].slice(0, MOST_LINES)
  return { headline, rows }
}
