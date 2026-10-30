import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { callAt, directionOf, verdictAt, verdictOfCall } from '@rca/core/change/types'
import type { ChangeEvidence } from '@rca/core/change/types'
import { perKilogramWords, resolutionClause, shownDirection } from '../changeWords'
import { NO_CLEAR_CHANGE } from '../recordChange'
import { effortLabel } from '../records'
import { splitValue } from './annotationTypes'
import type { CurveRow } from './curveTable'
import { formatNative, plottedValue } from './sportAxis'

/** How a sport's own number reads when it moves: its words, and whether a lower number is the better one. */
interface Wording {
  /** What the number is, in a sentence: "pace", "power". */
  noun: string
  better: string
  worse: string
  /** A pace is seconds per unit, so a smaller number is faster. */
  lowerIsBetter: boolean
  /** The size of a change as text, from whole plotted units and the unit of the sport's formatted value. */
  size: (amount: number, unit: string) => string
}

const WORDING: Record<Sport, Wording> = {
  run: {
    noun: 'pace',
    better: 'faster',
    worse: 'slower',
    lowerIsBetter: true,
    // The unit is "/km" or "/mi", set tight to the seconds: "13 s/km".
    size: (amount, unit) => `${amount} s${unit.trim()}`,
  },
  ride: {
    noun: 'power',
    better: 'higher',
    worse: 'lower',
    lowerIsBetter: false,
    size: (amount, unit) => `${amount}${unit}`,
  },
}

export interface TakeawayInput {
  sport: Sport
  units: UnitSystem
  rows: readonly CurveRow[]
  /** The period before, such as "Previous 12 weeks", when it has something to compare. */
  previousLabel: string | null
  /** The level the best 20 minutes grades to, such as "Local", when it can be graded. */
  level?: string
  /** The change test for the two periods (see changeEvidence); null where there is no period before. */
  change: ChangeEvidence | null
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/** A row whose value, in either period, is its own effort's: a carried value is a longer effort's, not a finding at this length. */
const measuredIn = (row: CurveRow, key: 'value' | 'previous') =>
  Number.isFinite(row[key]) &&
  (key === 'value' ? row.carried !== true : row.previousCarried !== true)

/**
 * The effort the comparison reads: the best 20 minutes when both periods have a measured one, else the longest
 * effort both have measured, which holds the most evidence. Only an effort the change test could judge counts: one
 * whose two periods hold too few efforts to tell a change from chance is passed over for a longer or shorter one.
 */
function comparedRow(
  rows: readonly CurveRow[],
  sport: Sport,
  change: ChangeEvidence | null,
): CurveRow | undefined {
  const both = rows.filter(
    (row) =>
      measuredIn(row, 'value') &&
      measuredIn(row, 'previous') &&
      verdictAt(change, sport, row.durationS, 'headline') !== 'untested',
  )
  return both.find((row) => row.durationS === HEADLINE_DURATION_S) ?? both.at(-1)
}

/** The best measured 20 minutes, or the longest measured effort when there is none. */
function bestRow(rows: readonly CurveRow[]): CurveRow | undefined {
  const measured = rows.filter((row) => measuredIn(row, 'value'))
  return measured.find((row) => row.durationS === HEADLINE_DURATION_S) ?? measured.at(-1)
}

/** The comparison a curve's finding makes: the sentence, and the effort length it cites. */
interface Comparison {
  text: string
  /** The effort the sentence is about, in seconds: it must be marked on the curve, or the title cites a length the plot does not show. */
  durationS: number
}

/**
 * What the change test says of one row, as a sentence, and the effort length the sentence cites (null for no clear
 * change, which still says which length it speaks of, since the title is about one). The title is a headline, so it is
 * held to the stricter band. Which way a move went is the call's (the compared unit), never the displayed watts; where
 * they disagree the sentence is in watts per kilogram.
 */
function comparisonOf(
  row: CurveRow,
  { sport, units, previousLabel, change }: TakeawayInput & { previousLabel: string },
): Comparison | { text: string; durationS: null } {
  const wording = WORDING[sport]
  const call = callAt(change, sport, row.durationS)
  const verdict = verdictOfCall(call, 'headline')
  const shift = plottedValue(sport, row.value, units) - plottedValue(sport, row.previous, units)
  const amount = Math.round(Math.abs(shift))
  const against = `the ${lowerFirst(previousLabel)}`
  const length = effortLabel(row.durationS)
  if (verdict !== 'higher' && verdict !== 'lower') {
    const clause = resolutionClause(call, 'headline')
    const tail = clause === '' ? '' : `; ${clause}`
    return { text: `${NO_CLEAR_CHANGE} in ${length} from ${against}${tail}`, durationS: null }
  }
  const direction = directionOf(call, 'headline')
  // Better is lower for a pace (a smaller number of seconds): the displayed figure and the call must agree on it.
  const shownBetter = shownDirection(wording.lowerIsBetter ? -shift : shift)
  if (shownBetter !== direction || amount === 0) {
    const perKilo = perKilogramWords(sport, call, 'headline')
    return perKilo === null
      ? { text: `${NO_CLEAR_CHANGE} in ${length} from ${against}`, durationS: null }
      : { text: `${length} is ${perKilo} than ${against}`, durationS: row.durationS }
  }
  const { unit } = splitValue(formatNative(sport, row.value, units))
  return {
    text: `${length} is ${wording.size(amount, unit)} ${direction > 0 ? wording.better : wording.worse} than ${against}`,
    durationS: row.durationS,
  }
}

/**
 * What a curve with a period before says: how far the 20 minute effort (or the longest effort both periods have
 * measured) moved, when the change test calls it a change, and then which effort that was; or that there is no clear
 * change, which cites no effort. Null with no period before, or no effort both periods have measured and the test
 * could judge.
 */
function comparison(input: TakeawayInput): Comparison | { text: string; durationS: null } | null {
  const { sport, rows, previousLabel, change } = input
  const compared = previousLabel === null ? undefined : comparedRow(rows, sport, change)
  if (previousLabel === null || compared === undefined) return null
  return comparisonOf(compared, { ...input, previousLabel })
}

/**
 * The sentence for one effort length, as the curve's title would say it: how far it moved against the period
 * before when the change test calls it, or that there is no clear change. Null without a period before, when either
 * period has no measured effort of that length, or when the test could not judge it.
 */
export function takeawayAt(input: TakeawayInput, durationS: number): string | null {
  const { sport, rows, previousLabel, change } = input
  const row = rows.find((candidate) => candidate.durationS === durationS)
  if (
    previousLabel === null ||
    row === undefined ||
    !measuredIn(row, 'value') ||
    !measuredIn(row, 'previous') ||
    verdictAt(change, sport, durationS, 'headline') === 'untested'
  ) {
    return null
  }
  return comparisonOf(row, { ...input, previousLabel }).text
}

/**
 * The effort length the curve's finding cites, when it cites one: the curve then marks it, so the title never
 * names a length the plot leaves unlabelled. Null for a finding about the best 20 minutes only, or about no effort.
 */
export function citedDurationS(input: TakeawayInput): number | null {
  return comparison(input)?.durationS ?? null
}

/**
 * The curve's finding, as the sentence its title carries. With a period before, it says how far the 20 minute
 * effort (or the longest effort both periods have measured) moved, when the move clears the floor above, or that
 * there is no clear change. Without one, it names the best, with its level. A carried value is never read
 * as a finding. Null when the curve has no measured effort to name.
 */
export function curveTakeaway(input: TakeawayInput): string | null {
  const { sport, units, rows, level } = input
  const compared = comparison(input)
  if (compared !== null) return compared.text
  const best = bestRow(rows)
  if (best === undefined) return null
  const graded = best.durationS === HEADLINE_DURATION_S && level !== undefined ? `, ${level}` : ''
  return `Best ${effortLabel(best.durationS)}: ${formatNative(sport, best.value, units)}${graded}`
}
