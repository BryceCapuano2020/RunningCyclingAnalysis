import type { ProfileRow } from '@rca/core/profile'
import { formatPercent } from '@rca/core/units'
import type { Sport } from '@rca/core/types'
import { SPORT_FORMAT } from '../sports'
import { effortLabel } from '../records'
import type { ChartLegendEntry } from './ChartLegend'
import type { ChartTableData, TooltipContent } from './chartTypes'
import { niceDomain } from './scale'

const Y_INTERVALS = 4
/** The fewest percent the vertical axis spans each side of zero, so a profile in line looks it. */
const MIN_REACH = 0.1

/**
 * The vertical scale, one for the whole chart: symmetric about zero, so a bump and a dip of the same size
 * look the same size, and rounded up from the widest range to round ticks, in per cent. Two charts can
 * differ in scale, so the chart says which it has.
 */
export function scaleOf(rows: readonly ProfileRow[]): {
  domain: [number, number]
  ticks: number[]
} {
  const reach = Math.max(
    MIN_REACH,
    ...rows.flatMap((row) => [Math.abs(row.low), Math.abs(row.high)]),
  )
  return niceDomain([-reach * 100, reach * 100], Y_INTERVALS, 0)
}

/** The scale in words, such as "Scale: ±40%". */
export function scaleNote(rows: readonly ProfileRow[]): string {
  return `Scale: ±${scaleOf(rows).domain[1]}%`
}

/** A residual as a signed whole percent, such as "+14%". */
export function signedPercent(fraction: number): string {
  return formatPercent(fraction, true)
}

/** The range of a residual, such as "+6% to +22%". */
export function rangeText(row: ProfileRow): string {
  return `${signedPercent(row.low)} to ${signedPercent(row.high)}`
}

/** A row's difference as the table writes it: "+14% above" when it stands out, else just "-2%". */
function differenceText(row: ProfileRow): string {
  const percent = signedPercent(row.residual)
  return row.standsOut === null ? percent : `${percent} ${row.standsOut}`
}

/** The table that holds every value the chart draws. */
export function tableOf(rows: readonly ProfileRow[], scale: string): ChartTableData {
  return {
    caption: `How far each best sits above or below what your other bests predict, with its range. Above or below marks a best that stands out. ${scale}.`,
    columns: ['Duration', 'Difference', 'Range'],
    rows: rows.map((row) => [effortLabel(row.durationS), differenceText(row), rangeText(row)]),
  }
}

/**
 * The key: a filled point stands out, a hollow one is in line, and the bar is the range. The
 * points are the sport's shape, a dot for running and a diamond for riding.
 */
export function keyOf(sport: Sport): ChartLegendEntry[] {
  const glyph = SPORT_FORMAT[sport].glyph
  return [
    { label: 'Stands out', kind: sport, swatch: glyph },
    { label: 'In line', kind: sport, swatch: glyph === 'dot' ? 'ring' : 'ring-diamond' },
    { label: 'Range', kind: sport, swatch: 'line' },
  ]
}

/** The tooltip of a duration, anchored at its point. */
export function tooltipOf(row: ProfileRow, x: number, y: number, sport: Sport): TooltipContent {
  return {
    x,
    y,
    title: effortLabel(row.durationS),
    rows: [
      {
        kind: sport,
        label: 'against your other bests',
        value: signedPercent(row.residual),
        note: row.standsOut === 'below' ? 'May be relatively low, or untested' : undefined,
      },
      { kind: 'neutral', label: 'range', value: rangeText(row) },
    ],
  }
}
