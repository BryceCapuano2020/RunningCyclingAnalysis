import type { ProfileRow } from '@rca/core/profile'
import { formatPercent } from '@rca/core/units'
import type { Sport } from '@rca/core/types'
import { SPORT_FORMAT } from '../sports'
import { effortLabel } from '../records'
import type { ChartLegendEntry } from './ChartLegend'
import type { ChartTableData, TooltipContent } from './chartTypes'

/** A residual as a signed whole percent, such as "+14%". */
export function signedPercent(fraction: number): string {
  return formatPercent(fraction, true)
}

/** The likely range of a residual, such as "+6% to +22%". */
export function rangeText(row: ProfileRow): string {
  return `${signedPercent(row.low)} to ${signedPercent(row.high)}`
}

/** A row's difference as the table writes it: "+14% above" when it stands out, else just "-2%". */
function differenceText(row: ProfileRow): string {
  const percent = signedPercent(row.residual)
  return row.standsOut === null ? percent : `${percent} ${row.standsOut}`
}

/** The table that holds every value the chart draws. */
export function tableOf(rows: readonly ProfileRow[]): ChartTableData {
  return {
    caption:
      'How far each best sits above or below what your other bests predict, with its likely range. Above or below marks a best that stands out.',
    columns: ['Duration', 'Difference', 'Likely range'],
    rows: rows.map((row) => [effortLabel(row.durationS), differenceText(row), rangeText(row)]),
  }
}

/**
 * The key: a filled point stands out, a hollow one is in line, and the bar is the likely range. The
 * points are the sport's shape, a dot for running and a diamond for riding.
 */
export function keyOf(sport: Sport): ChartLegendEntry[] {
  const glyph = SPORT_FORMAT[sport].glyph
  return [
    { label: 'Stands out', kind: sport, swatch: glyph },
    { label: 'In line', kind: sport, swatch: glyph === 'dot' ? 'ring' : 'ring-diamond' },
    { label: 'Likely range', kind: sport, swatch: 'line' },
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
      { kind: 'neutral', label: 'likely range', value: rangeText(row) },
    ],
  }
}
