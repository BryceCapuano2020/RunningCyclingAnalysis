import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { effortLabel } from '../records'
import { splitValue } from './annotationTypes'
import type { CurveRow } from './curveTable'
import { formatNative, plottedValue } from './sportAxis'
import type { ThresholdLine } from './sportCurveModel'

/** How a sport's own number reads when it moves: its words, and whether a lower number is the better one. */
interface Wording {
  /** What the number is, in a sentence: "pace", "power". */
  noun: string
  better: string
  worse: string
  /** A pace is seconds per unit, so a smaller number is quicker. */
  lowerIsBetter: boolean
  /** The size of a change as text, from whole plotted units and the unit of the sport's formatted value. */
  size: (amount: number, unit: string) => string
}

const WORDING: Record<Sport, Wording> = {
  run: {
    noun: 'pace',
    better: 'quicker',
    worse: 'slower',
    lowerIsBetter: true,
    size: (amount, unit) => `${amount} s${unit}`,
  },
  ride: {
    noun: 'power',
    better: 'higher',
    worse: 'lower',
    lowerIsBetter: false,
    size: (amount, unit) => `${amount}${unit}`,
  },
}

/** The least a change is called a change when the threshold gives no range to judge it by: 1% of the earlier value. */
const MIN_RELATIVE_CHANGE = 0.01

export interface TakeawayInput {
  sport: Sport
  units: UnitSystem
  rows: readonly CurveRow[]
  /** The period before, such as "Previous 12 weeks", when it has something to compare. */
  previousLabel: string | null
  /** The threshold with its range: a change inside the range is not a change. */
  threshold: ThresholdLine | null
  /** The level the best 20 minutes grades to, such as "Local", when it can be graded. */
  level?: string
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/**
 * The effort the comparison reads: the best 20 minutes when both periods have one, else the longest effort
 * both have, which holds the most evidence.
 */
function comparedRow(rows: readonly CurveRow[]): CurveRow | undefined {
  const both = rows.filter((row) => Number.isFinite(row.value) && Number.isFinite(row.previous))
  return both.find((row) => row.durationS === HEADLINE_DURATION_S) ?? both.at(-1)
}

/** The best 20 minutes, or the longest effort when there is none. */
function bestRow(rows: readonly CurveRow[]): CurveRow | undefined {
  const finite = rows.filter((row) => Number.isFinite(row.value))
  return finite.find((row) => row.durationS === HEADLINE_DURATION_S) ?? finite.at(-1)
}

/**
 * The curve's finding, as the sentence its title carries. With a period before, it says how far the 20 minute
 * effort (or the longest effort both periods have) moved, when the move is larger than the threshold's own range, or that it held steady.
 * Without one, it names the best, with its level. Null when the curve has no effort to name.
 */
export function curveTakeaway({
  sport,
  units,
  rows,
  previousLabel,
  threshold,
  level,
}: TakeawayInput): string | null {
  const wording = WORDING[sport]
  const compared = previousLabel === null ? undefined : comparedRow(rows)
  if (previousLabel !== null && compared !== undefined) {
    const now = plottedValue(sport, compared.value, units)
    const before = plottedValue(sport, compared.previous, units)
    const range =
      threshold?.low !== undefined && threshold.high !== undefined
        ? Math.abs(
            plottedValue(sport, threshold.high, units) - plottedValue(sport, threshold.low, units),
          )
        : 0
    const change = now - before
    const amount = Math.round(Math.abs(change))
    const moved =
      amount >= 1 && Math.abs(change) > Math.max(range, Math.abs(before) * MIN_RELATIVE_CHANGE)
    const against = `the ${lowerFirst(previousLabel)}`
    const effort = effortLabel(compared.durationS)
    if (!moved) return `Your ${effort} ${wording.noun} held steady against ${against}`
    const better = wording.lowerIsBetter ? change < 0 : change > 0
    const { unit } = splitValue(formatNative(sport, compared.value, units))
    return `${effort} is ${wording.size(amount, unit)} ${better ? wording.better : wording.worse} than ${against}`
  }
  const best = bestRow(rows)
  if (best === undefined) return null
  const graded = best.durationS === HEADLINE_DURATION_S && level !== undefined ? `, ${level}` : ''
  return `Best ${effortLabel(best.durationS)}: ${formatNative(sport, best.value, units)}${graded}`
}
