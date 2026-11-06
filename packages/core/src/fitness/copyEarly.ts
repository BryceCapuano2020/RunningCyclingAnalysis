import { counted, formatBpm, formatDay } from '../findings/copy'
import { EARLY_TREND, FITNESS } from './params'
import type { EarlyGroup, FitnessStatus, Shortfall } from './types'

const A = FITNESS.early
const M = FITNESS.monitor

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const percent = (fraction: number) => `${signed(Math.round(fraction * 100))}%`

const groupText = (name: string, g: EarlyGroup): string => {
  const heart = g.heartRate === null ? '' : `, ${formatBpm(g.heartRate)} median`
  return `${name}: ${counted(g.runs, 'ride')}, ${formatDay(g.fromMs)} to ${formatDay(g.toMs)}${heart}.`
}

/**
 * The early trend of a status waiting for its baseline, one line each: the signed change with its range (no direction word,
 * never "up" or "down"), the two groups with their spans and heart rates, and what moves the figure. Empty without one.
 */
export function earlyLines(s: FitnessStatus): string[] {
  const e = s.early
  if (e === undefined) return []
  const { value, low, high } = e.change
  return [
    `${percent(value)} on your first power-meter rides, ${formatDay(e.first.fromMs)} (${percent(low)} to ${percent(high)}).`,
    groupText('First', e.first),
    groupText('Newest', e.newest),
    'A season, the weather and a change of meter move this figure until the full trend.',
  ]
}

/** What the full trend needs once an early trend is shown, or what an early trend needs while it is not: one line, or empty. */
export function earlyNeeds(s: FitnessStatus, shortfall: Shortfall): string {
  if (!EARLY_TREND[s.sport] || shortfall.kind !== 'history') return ''
  if (s.early !== undefined) {
    return `The full trend starts once ${M.minRefRuns} power-meter rides over ${M.minRefWeeks} different weeks are ${M.refEndWeeks} weeks old. ${shortfall.have} so far.`
  }
  const need = 2 * A.minGroup - s.steady
  return need > 0
    ? `${counted(need, 'more power-meter ride')} with heart rate for an early trend.`
    : ''
}

/** Why a ride with only modelled power is not compared. */
export const VIRTUAL_ONLY =
  'Power worked out from speed moves with wind and drafting, so it is not compared.'
