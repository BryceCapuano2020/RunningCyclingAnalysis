import { useId } from 'react'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import { PlotDistribution } from './ActivityWorkbenchDistribution'
import { PlotTable } from './ActivityWorkbenchPlotTable'
import { axisFor, plotRunsFor } from './workbenchData'
import type { PlotRun } from './workbenchDownsample'
import {
  DISTRIBUTION_METRICS,
  displayValue,
  metricLabel,
  metricUnit,
  readingRange,
} from './workbenchFormat'
import { beyondAxis, beyondNote } from './workbenchText'

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
  const axis = axisFor(trace, metric, startS, endS)
  if (axis === null) return <p className="secondary">{label}: none in this interval.</p>

  const { low, high } = axis
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  const runs = plotRunsFor(trace, metric, startS, endS)
  const range = readingRange(metric, trace.sport, low, high)
  const note = beyondNote(beyondAxis(metric, trace, units, axis))
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
          <path className="activity-workbench__line" d={pathOf(runs, low, high, startS, endS)} />
          {note !== null && (
            <path
              className="activity-workbench__clipped"
              d={clippedMarks(runs, low, high, startS, endS)}
            />
          )}
        </svg>
        <div className="activity-workbench__axis" aria-hidden="true">
          <span>{formatRecordTime(startS)}</span>
          <span>{formatRecordTime(endS)}</span>
        </div>
      </div>
      {note !== null && <p className="muted activity-workbench__note">{note}</p>}
      {DISTRIBUTION_METRICS.includes(metric) && (
        <PlotDistribution trace={trace} metric={metric} units={units} startS={startS} endS={endS} />
      )}
      <PlotTable trace={trace} metric={metric} units={units} startS={startS} endS={endS} />
    </figure>
  )
}

/** A reading's place on the plot, from the left edge and from the top. A reading past the axis sits on its edge. */
function placeOf(
  point: PlotRun[number],
  low: number,
  high: number,
  startS: number,
  endS: number,
): { x: number; y: number } {
  const span = Math.max(1, endS - startS)
  const x = ((point.timeS - startS) / span) * WIDTH
  if (high === low) return { x, y: HEIGHT / 2 }
  const y = HEIGHT - ((point.value - low) / (high - low)) * HEIGHT
  return { x, y: Math.min(HEIGHT, Math.max(0, y)) }
}

/** The runs as one path. A single reading is a zero-length stroke, drawn as a dot by the round cap. */
function pathOf(runs: PlotRun[], low: number, high: number, startS: number, endS: number): string {
  return runs
    .map((run) =>
      run
        .map((point, index) => {
          const { x, y } = placeOf(point, low, high, startS, endS)
          return `${index === 0 ? 'M' : 'L'} ${x} ${y}${run.length === 1 ? ` L ${x} ${y}` : ''}`
        })
        .join(' '),
    )
    .join(' ')
}

/** A dot on the axis edge for each reading past it, so a clipped reading is seen and not lost. */
function clippedMarks(
  runs: PlotRun[],
  low: number,
  high: number,
  startS: number,
  endS: number,
): string {
  return runs
    .flat()
    .filter((point) => point.value < low || point.value > high)
    .map((point) => {
      const { x, y } = placeOf(point, low, high, startS, endS)
      return `M ${x} ${y} L ${x} ${y}`
    })
    .join(' ')
}
