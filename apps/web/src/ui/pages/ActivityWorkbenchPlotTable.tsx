import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import { ChartTable } from '../charts/ChartTable'
import { axisFor, distributionFor, selectionOf } from './workbenchData'
import {
  DISTRIBUTION_METRICS,
  displayValue,
  isPaceReading,
  metricLabel,
  rangeHeadings,
  readingRange,
} from './workbenchFormat'
import { beyondAxis, binRange, distributionTitle, noReadingLabel } from './workbenchText'

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
  const binRows = bins.map((bin) => [
    binRange(bin, metric, trace, units),
    formatRecordTime(bin.seconds),
  ])
  // The time past a trimmed axis has its own rows at the ends, so the table still adds up to the moving time.
  const axis = bins.length > 0 ? axisFor(trace, metric, startS, endS) : null
  if (axis !== null) {
    const { below, above } = beyondAxis(metric, trace, units, axis)
    const [first, last] = isPaceReading(metric, trace.sport) ? [above, below] : [below, above]
    const row = (item: typeof below) =>
      item === null
        ? []
        : [
            [
              item.words.charAt(0).toUpperCase() + item.words.slice(1),
              formatRecordTime(item.seconds),
            ],
          ]
    binRows.unshift(...row(first))
    binRows.push(...row(last))
  }
  if (bins.length > 0 && missing > 0)
    binRows.push([noReadingLabel(metric, trace.sport), formatRecordTime(missing)])
  return (
    <details className="activity-workbench__details">
      <summary>View as table</summary>
      <ChartTable
        caption={`${label} by section of the interval`}
        columns={['From', 'Average', ...rangeHeadings(metric, trace.sport)]}
        rows={sections}
      />
      {binRows.length > 0 && (
        <ChartTable
          caption={`${distributionTitle(metric, trace.sport)} while moving`}
          columns={['Range', 'Time']}
          rows={binRows}
        />
      )}
    </details>
  )
}
