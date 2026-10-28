import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatRecordTime, formatTotalTime } from '@rca/core/units'
import { ChartTable } from '../charts/ChartTable'
import { selectionOf } from './workbenchData'
import { METRIC_ORDER, displayValue, metricLabel, readingRange } from './workbenchFormat'

const NONE = 'None in this interval'

export function SelectionStats({
  trace,
  startS,
  endS,
  units,
  metrics,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  units: UnitSystem
  /** The measures shown, which the table follows. */
  metrics: readonly TraceMetric[]
}) {
  const summary = selectionOf(trace, startS, endS)
  const paused = summary.recordedS - summary.movingS
  const unrecorded = summary.elapsedS - summary.recordedS
  const tiles: [label: string, value: string][] = [
    ['Elapsed time', formatTotalTime(summary.elapsedS)],
  ]
  // Moving time is shown only where it differs from elapsed time, and a gap or pause only where there is one.
  if (paused > 0 || unrecorded > 0) tiles.push(['Moving time', formatTotalTime(summary.movingS)])
  if (paused > 0) tiles.push(['Paused time', formatTotalTime(paused)])
  if (unrecorded > 0) tiles.push(['Unrecorded time', formatTotalTime(unrecorded)])
  tiles.push([
    'Distance',
    summary.distanceM === null
      ? 'Not available for this interval'
      : formatDistance(summary.distanceM, units),
  ])
  const rows = METRIC_ORDER.filter((metric) => metrics.includes(metric)).flatMap((metric) => {
    const stats = summary.metrics[metric]
    if (!stats) return []
    const text = (value: number) =>
      displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
    if (stats.mean === null || stats.min === null || stats.max === null)
      return [[metricLabel(metric, trace.sport), NONE, NONE, NONE, formatRecordTime(0)]]
    const { lowest, highest } = readingRange(metric, trace.sport, stats.min, stats.max)
    return [
      [
        metricLabel(metric, trace.sport),
        text(stats.mean),
        text(lowest),
        text(highest),
        formatRecordTime(stats.seconds),
      ],
    ]
  })
  return (
    <div className="activity-workbench__stats">
      <h3>Interval summary</h3>
      <dl className="activity-workbench__summary">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {rows.length > 0 && (
        <ChartTable
          caption="While moving in the selected interval. Time is how long each measure had a reading."
          columns={['Measure', 'Average', 'Lowest', 'Highest', 'Time']}
          rows={rows}
        />
      )}
    </div>
  )
}
