import type { ReactNode } from 'react'
import type { SeriesKind } from './chartTypes'
import './ChartLegend.css'

/**
 * Key shape: a square for a fill, a dot or a diamond for a point (a ring or a hollow diamond when the point is hollow), a band for a shaded range, a line,
 * or a dashed line for an estimate or a comparison.
 */
export type LegendSwatch =
  'solid' | 'dot' | 'diamond' | 'ring' | 'ring-diamond' | 'band' | 'band-strong' | 'line' | 'dashed'

export interface ChartLegendEntry {
  label: string
  kind: SeriesKind
  swatch?: LegendSwatch
}

export interface ChartLegendProps {
  entries: ChartLegendEntry[]
}

const SWATCH_CLASS: Record<SeriesKind, string> = {
  run: 'swatch-run',
  ride: 'swatch-ride',
  neutral: 'chart-legend__swatch--neutral',
}

const LINE_KIND_CLASS: Record<SeriesKind, string> = {
  run: 'chart-legend__key--run',
  ride: 'chart-legend__key--ride',
  neutral: 'chart-legend__key--neutral',
}

function keyFor(entry: ChartLegendEntry): ReactNode {
  switch (entry.swatch ?? 'solid') {
    case 'band':
      return <span aria-hidden="true" className="chart-legend__key chart-legend__key--band" />
    case 'band-strong':
      // Two layers of the band fill, with the median line through the middle.
      return (
        <span aria-hidden="true" className="chart-legend__key chart-legend__key--band-strong">
          <span className="chart-legend__layer" />
          <span className="chart-legend__median" />
        </span>
      )
    case 'line':
      return (
        <span
          aria-hidden="true"
          className={`chart-legend__key chart-legend__key--line ${LINE_KIND_CLASS[entry.kind]}`}
        />
      )
    case 'diamond':
      return (
        <span
          aria-hidden="true"
          className={`chart-legend__key chart-legend__key--diamond ${LINE_KIND_CLASS[entry.kind]}`}
        />
      )
    case 'ring':
    case 'ring-diamond':
      // A hollow point: the same shape as its filled key, set in the page colour with an outline in the
      // sport's colour, which a sport's kind names on data-sport.
      return (
        <span
          aria-hidden="true"
          className={`chart-legend__key chart-legend__key--${entry.swatch}`}
          data-sport={entry.kind === 'neutral' ? undefined : entry.kind}
        />
      )
    case 'dot':
      return (
        <span
          aria-hidden="true"
          className={`chart-legend__key chart-legend__key--dot ${LINE_KIND_CLASS[entry.kind]}`}
        />
      )
    case 'dashed':
      return (
        <span
          aria-hidden="true"
          className={`chart-legend__key chart-legend__key--dashed chart-legend__key--dashed-${entry.kind}`}
        />
      )
    case 'solid':
      return <span aria-hidden="true" className={`swatch ${SWATCH_CLASS[entry.kind]}`} />
  }
}

export function ChartLegend({ entries }: ChartLegendProps) {
  return (
    <ul className="chart-legend" aria-label="Legend">
      {entries.map((entry) => (
        <li key={entry.label} className="chart-legend__item">
          {keyFor(entry)}
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
