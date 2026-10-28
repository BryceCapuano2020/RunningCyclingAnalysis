import { useId } from 'react'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import { PlotDistribution } from './ActivityWorkbenchDistribution'
import { PlotTable } from './ActivityWorkbenchPlotTable'
import { plotRunsFor, selectionOf } from './workbenchData'
import type { PlotRun } from './workbenchDownsample'
import {
  DISTRIBUTION_METRICS,
  displayValue,
  metricLabel,
  metricUnit,
  readingRange,
} from './workbenchFormat'

const WIDTH = 600
const HEIGHT = 180

export function ActivityWorkbenchPlot({
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
  const titleId = useId()
  if (!trace.streams[metric]) return null
  const label = metricLabel(metric, trace.sport)
  const stats = selectionOf(trace, startS, endS).metrics[metric]
  if (!stats || stats.min === null || stats.max === null)
    return <p className="secondary">{label}: none in this interval.</p>

  const low = stats.min
  const high = stats.max
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  const path = pathOf(plotRunsFor(trace, metric, startS, endS), low, high, startS, endS)
  const range = readingRange(metric, trace.sport, low, high)
  const summary = `${label} from ${formatRecordTime(startS)} to ${formatRecordTime(endS)}, ${low === high ? `steady at ${text(low)}` : `between ${text(range.lowest)} and ${text(range.highest)}`}`
  return (
    <figure className="activity-workbench__plot" aria-labelledby={titleId}>
      <figcaption id={titleId}>
        {label} <span>({metricUnit(metric, trace.sport, units, trace.cadenceUnit)})</span>
      </figcaption>
      <div className="activity-workbench__plot-body">
        <div className="activity-workbench__yaxis" aria-hidden="true">
          <span>{text(high)}</span>
          {high !== low && <span>{text(low)}</span>}
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={summary}
          preserveAspectRatio="none"
        >
          <path className="activity-workbench__line" d={path} />
        </svg>
        <div className="activity-workbench__axis" aria-hidden="true">
          <span>{formatRecordTime(startS)}</span>
          <span>{formatRecordTime(endS)}</span>
        </div>
      </div>
      {DISTRIBUTION_METRICS.includes(metric) && (
        <PlotDistribution trace={trace} metric={metric} units={units} startS={startS} endS={endS} />
      )}
      <PlotTable trace={trace} metric={metric} units={units} startS={startS} endS={endS} />
    </figure>
  )
}

/** The runs as one path. A single reading is a zero-length stroke, drawn as a dot by the round cap. */
function pathOf(runs: PlotRun[], low: number, high: number, startS: number, endS: number): string {
  const span = Math.max(1, endS - startS)
  return runs
    .map((run) =>
      run
        .map((point, index) => {
          const x = ((point.timeS - startS) / span) * WIDTH
          const y =
            high === low ? HEIGHT / 2 : HEIGHT - ((point.value - low) / (high - low)) * HEIGHT
          return `${index === 0 ? 'M' : 'L'} ${x} ${y}${run.length === 1 ? ` L ${x} ${y}` : ''}`
        })
        .join(' '),
    )
    .join(' ')
}
