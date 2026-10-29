import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PER } from '../format/units'
import { plottedValue } from './sportAxis'
import { findingOf, phraseOf, withTail } from './trendFinding'
import type { Better, PhraseTools, Reading, Words } from './trendFinding'
import { sinceLabel } from './trendTakeaway'

/** One row of a sport's trend, as the title reads it: its week's end and its value, null where none. */
export interface TakeawayRow {
  endMs: number
  /** The sport's own number: a speed in m/s for running, watts for cycling. */
  value: number | null
}

/** The direction a better value lies in, by sport: a pace is seconds, so a lower number is better. */
const BETTER: Record<Sport, Better> = { run: -1, ride: 1 }

/** The name of the number in a title, by sport. */
const MEASURE: Record<Sport, string> = { run: 'pace', ride: 'power' }

/** How a rise, a fall and the distance under the peak are put, by sport. */
const WORDS: Record<Sport, Omit<Words, 'steady'>> = {
  run: {
    highest: 'is the fastest on file',
    peakAfter: (amount, year) => `${amount} slower than its ${year} best`,
    better: (amount) => `is ${amount} faster`,
    worse: (amount) => `is ${amount} slower`,
    peak: (amount, year) => `is ${amount} slower than its ${year} best`,
  },
  ride: {
    highest: 'is the highest on file',
    peakAfter: (amount, year) => `${amount} under its ${year} peak`,
    better: (amount) => `rose ${amount}`,
    worse: (amount) => `fell ${amount}`,
    peak: (amount, year) => `is ${amount} under its ${year} peak`,
  },
}

/** The size of a change in the sport's own number, in whole units: seconds per distance, or watts. */
const AMOUNT: Record<Sport, (units: UnitSystem, size: number) => string> = {
  run: (units, size) => `${size} s ${PER[units]}`,
  ride: (_, size) => `${size} W`,
}

/**
 * The title of a sport's own trend, which says what it found about now, in at most two clauses: "Your best
 * 20 min pace is 12 s per kilometre faster over the last year", or "Your best 20 min power is 20 W under its 2021
 * peak; steady over the last year". The move is judged over the last year, or the whole span when that is shorter;
 * a change under the minimum, or one that rounds to nothing, is "held steady". Null with fewer than two values.
 */
export function sportTakeaway(
  rows: readonly TakeawayRow[],
  sport: Sport,
  units: UnitSystem,
  effort: string,
): string | null {
  const readings: Reading[] = rows.flatMap((row) =>
    row.value === null
      ? []
      : [{ endMs: row.endMs, raw: plottedValue(sport, row.value, units), low: null, high: null }],
  )
  const tools: PhraseTools = {
    words: { ...WORDS[sport], steady: 'has held steady' },
    amountOf: (from, to) => {
      const size = Math.round(Math.abs(to - from))
      return size === 0 ? null : AMOUNT[sport](units, size)
    },
    since: sinceLabel,
  }
  const phrase = phraseOf(
    `Your best ${effort} ${MEASURE[sport]}`,
    findingOf(readings, BETTER[sport]),
    tools,
  )
  if (phrase === null) return null
  return [withTail(phrase.lead), ...(phrase.follow === null ? [] : [phrase.follow])].join('; ')
}
