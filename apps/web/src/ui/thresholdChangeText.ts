import type { ThresholdChange } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { PACE_UNIT, formatPower, formatRecordTime } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { withThe } from './previousLabel'
import { SPORT_ACTIVITY } from './sports'

/** The change as the hero's third figure: the amount in mono, and the words around it (the way, the period) in the serif. */
export interface ChangeFigure {
  /** The amount, a figure with its unit; null where the words are the whole value. */
  amount: string | null
  words: string
}

/** A moved threshold's amount, and the word for the way it moved: a ride's watts with their sign, a run's seconds of pace in the unit. */
const AMOUNT: Record<Sport, (shown: number, units: UnitSystem) => { amount: string; way: string }> =
  {
    ride: (shown) => ({
      amount: `${shown > 0 ? '+' : '\u2212'}${formatPower(Math.abs(shown))}`,
      way: '',
    }),
    run: (shown, units) => ({
      amount: `${formatRecordTime(Math.abs(shown))} ${PACE_UNIT[units]}`,
      way: shown > 0 ? 'faster ' : 'slower ',
    }),
  }

/**
 * What the sport page says of a threshold against the previous period of the same length ("+12 W", "on the previous 12 weeks"), from
 * core's `thresholdChange`; the numbers are its. With no earlier estimate the whole figure is one sentence naming what is missing.
 * `previousLabel` is null for all time, which has no period before and so no change to say.
 */
export function changeFigure(
  sport: Sport,
  change: ThresholdChange,
  previousLabel: string,
  units: UnitSystem,
): ChangeFigure {
  if (change.kind === 'none') {
    return { amount: null, words: `No earlier ${SPORT_ACTIVITY[sport]} with a threshold` }
  }
  const against = `on ${withThe(previousLabel)}`
  if (change.shown === 0) return { amount: null, words: `No change ${against}` }
  const { amount, way } = AMOUNT[sport](change.shown, units)
  return { amount, words: `${way}${against}` }
}
