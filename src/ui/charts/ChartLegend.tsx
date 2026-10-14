import type { SeriesKind } from './chartTypes'
import './ChartLegend.css'

export interface ChartLegendEntry {
  label: string
  kind: SeriesKind
}

export interface ChartLegendProps {
  entries: ChartLegendEntry[]
}

const SWATCH_CLASS: Record<SeriesKind, string> = {
  run: 'swatch-run',
  ride: 'swatch-ride',
  neutral: 'chart-legend__swatch--neutral',
}

export function ChartLegend({ entries }: ChartLegendProps) {
  return (
    <ul className="chart-legend" aria-label="Legend">
      {entries.map((entry) => (
        <li key={entry.label} className="chart-legend__item">
          <span aria-hidden="true" className={`swatch ${SWATCH_CLASS[entry.kind]}`} />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
