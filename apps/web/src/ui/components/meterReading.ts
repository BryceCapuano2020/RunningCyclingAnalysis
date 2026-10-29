import { wholeCentre } from '../../domain/lean'
import type { BalanceReading } from './balanceScale'
import { isPoint, percentEdge, rangeEdges, signedCount } from './headlineText'

/** The value the meter prints at its dot: the size of the lead and its unit, set apart so the unit can be quieter. */
export interface MeterValue {
  number: string
  unit: string
}

/** A lead of an energy balance under this many percent is written "<0.1", since one decimal would print 0.0. */
const TINY_PERCENT = 0.05

/**
 * The lead as the dot labels it: "+11" and "pts" for a grade gap, "+12" and "%" for an energy balance. A level
 * gap of zero is "0", with no sign, and so is an energy lead of exactly zero. The sign is the lead's size, never
 * its side: the dot's place says which sport leads.
 */
export function meterValue(reading: BalanceReading): MeterValue {
  if (reading.unit === 'percent') {
    const size = Math.abs(reading.lead.centre)
    if (size === 0) return { number: '0', unit: '%' }
    if (size < TINY_PERCENT) return { number: '<0.1', unit: '%' }
    return { number: `+${percentEdge(size, false).replace('%', '')}`, unit: '%' }
  }
  const size = Math.abs(wholeCentre(reading.lead))
  return { number: size === 0 ? '0' : signedCount(size), unit: 'pts' }
}

/**
 * The range under the value: "6 to 16", or "−4 to +18" when it reaches zero, written from the side the balance
 * is read from. Null when the range rounds to one value, which the value already says.
 */
export function meterRange(reading: BalanceReading): string | null {
  return isPoint(reading) ? null : rangeEdges(reading)
}

/** The word before the range's edges, and the space after it. */
export const RANGE_WORD = 'range'

/** The line under an energy balance's range when the heart-rate check informed it. */
export const BASIS_TEXT = 'informed by heart rate'

/**
 * How many characters each part of the reading takes, which the stylesheet turns into the room the reading keeps
 * from the track's ends: the number, its unit, the range line with its word, and the heart-rate line when shown.
 */
export function readingChars(
  reading: BalanceReading,
  adjusted = false,
): {
  number: number
  unit: number
  range: number
  basis: number
} {
  const value = meterValue(reading)
  const range = meterRange(reading)
  return {
    number: value.number.length,
    unit: value.unit.length,
    range: range === null ? 0 : RANGE_WORD.length + 1 + range.length,
    basis: adjusted && reading.unit === 'percent' ? BASIS_TEXT.length : 0,
  }
}

/**
 * What the range says about a grade lead, for the meter's spoken name only: it holds across the whole range, or
 * the range reaches level. Null for an energy balance and for a range that rounds to one value.
 */
export function rangeVerdictText(reading: BalanceReading): string | null {
  if (reading.unit !== 'points' || isPoint(reading)) return null
  const { low, high } = reading.lead
  const holds = Math.round(low) > 0 || Math.round(high) < 0
  return holds ? 'so the lead holds across the range' : 'so the two could be level'
}
