import { wholeCentre } from '../../domain/lean'
import type { BalanceReading } from './balanceScale'
import { isPoint, percentEdge, rangeEdges, signedCount } from './headlineText'

/** The value the meter prints at its dot: the size of the lead and its unit, set apart so the unit can be quieter. */
export interface MeterValue {
  number: string
  unit: string
}

/**
 * The lead as the dot labels it: "+11" and "pts" for a grade gap, "+12" and "%" for an energy balance. A level
 * gap of zero is "0 pts". The sign is the lead's size, never its side: the dot's place says which sport leads.
 */
export function meterValue(reading: BalanceReading): MeterValue {
  if (reading.unit === 'percent') {
    const percent = percentEdge(Math.abs(reading.lead.centre), false)
    return { number: `+${percent.replace('%', '')}`, unit: '%' }
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
