import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import { ChartTable } from '../charts/ChartTable'
import { distributionFor, selectionOf } from './workbenchData'
import { DISTRIBUTION_METRICS, displayValue, metricLabel, readingRange } from './workbenchFormat'
import { binRange, noReadingLabel } from './workbenchText'

/** The most sections the interval is cut into for the table. */
const SECTIONS = 10

/** The interval cut into near-equal whole-second sections, none empty. */
function sectionsOf(startS: number, endS: number): [number, number][] {
  const count = Math.max(1, Math.min(SECTIONS, endS - startS))
  return Array.from({ length: count }, (_, index): [number, number] => [
    startS + Math.floor(((endS - startS) * index) / count),
    startS + Math.floor(((endS - startS) * (index + 1)) / count),
  ])
}

/** The text twin of a plot: the measure over the interval section by section, and its histogram. */
export function PlotTable({
  trace,
  metric,
  units,
  startS,
  endS,
}: {
  trace: ActivityTrace
  metric: TraceMetric
  units: UnitSystem
  startS: number
  endS: number
}) {
  const label = metricLabel(metric, trace.sport)
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  const none = 'None'
  const sections = sectionsOf(startS, endS).map(([from, to]) => {
    const stats = selectionOf(trace, from, to).metrics[metric]
    if (!stats || stats.min === null || stats.max === null || stats.mean === null)
      return [formatRecordTime(from), none, none, none]
    const { lowest, highest } = readingRange(metric, trace.sport, stats.min, stats.max)
    return [formatRecordTime(from), text(stats.mean), text(lowest), text(highest)]
  })
  const bins = DISTRIBUTION_METRICS.includes(metric)
    ? distributionFor(trace, metric, startS, endS)
    : []
  const selection = selectionOf(trace, startS, endS)
  const missing = Math.max(0, selection.movingS - (selection.metrics[metric]?.seconds ?? 0))
  const binRows = bins.map((bin) => [binRange(bin, metric, trace, units), `${bin.seconds}`])
  if (bins.length > 0 && missing > 0) binRows.push([noReadingLabel(metric), `${missing}`])
  return (
    <details className="activity-workbench__details">
      <summary>View as table</summary>
      <ChartTable
        caption={`${label} by section of the interval`}
        columns={['From', 'Average', 'Lowest', 'Highest']}
        rows={sections}
      />
      {binRows.length > 0 && (
        <ChartTable
          caption={`Seconds moving at each ${label.toLowerCase()}`}
          columns={['Range', 'Seconds']}
          rows={binRows}
        />
      )}
    </details>
  )
}
