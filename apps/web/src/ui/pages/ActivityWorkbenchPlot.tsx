import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import { distributionOf, summarizeSelection } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatTotalTime } from '@rca/core/units'
import { displayValue, metricLabel, metricUnit } from './workbenchFormat'
import { downsampleActivityTrace } from './workbenchDownsample'
import { ScrollableTableRegion } from './ScrollableTableRegion'

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
  const stream = trace.streams[metric]
  if (!stream) return null
  const selection = summarizeSelection(trace, startS, endS)
  const stats = selection.metrics[metric]
  if (!stats || stats.min === null || stats.max === null)
    return (
      <p className="secondary">
        No valid moving {metricLabel(metric, trace.sport).toLowerCase()} readings in this interval.
      </p>
    )
  const points = downsampleActivityTrace(trace, metric, startS, endS, 600)
  const finite = points.filter((point) => Number.isFinite(point.value))
  if (finite.length < 2)
    return (
      <p className="secondary">
        {metricLabel(metric, trace.sport)} has too few recorded points in this interval.
      </p>
    )
  const low = stats.min
  const high = stats.max
  const padding = high === low ? Math.max(Math.abs(high) * 0.03, 1) : (high - low) * 0.08
  const min = low - padding
  const max = high + padding
  const width = 600
  const height = 180
  const line = pathOf(points, min, max, width, height, startS, endS)
  const observedDistribution = distributionOf(trace, metric, startS, endS)
  const validSeconds = selection.metrics[metric]?.seconds ?? 0
  const missingSeconds = Math.max(0, selection.movingS - validSeconds)
  const distribution =
    missingSeconds > 0
      ? [...observedDistribution, { from: Number.NaN, to: Number.NaN, seconds: missingSeconds }]
      : observedDistribution

  const rangeStart = metric === 'speed' && trace.sport === 'run' ? high : low
  const rangeEnd = metric === 'speed' && trace.sport === 'run' ? low : high
  return (
    <figure className="activity-workbench__plot">
      <figcaption>
        {metricLabel(metric, trace.sport)}{' '}
        <span>({metricUnit(metric, trace.sport, units, trace.cadenceUnit)})</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metricLabel(metric, trace.sport)} during selected moving time`}
        preserveAspectRatio="none"
      >
        <title>{metricLabel(metric, trace.sport)} during selected moving time</title>
        <path className="activity-workbench__line" d={line} />
      </svg>
      <p className="muted activity-workbench__plot-range">
        Observed moving range:{' '}
        {displayValue(metric, rangeStart, trace.sport, units, trace.cadenceUnit)} to{' '}
        {displayValue(metric, rangeEnd, trace.sport, units, trace.cadenceUnit)}
      </p>
      <div className="activity-workbench__axis">
        <span>{formatTotalTime(startS)}</span>
        <span>{formatTotalTime(endS)}</span>
      </div>
      {distribution.length > 0 && (
        <>
          <DistributionHistogram metric={metric} values={distribution} trace={trace} />
          <DistributionTable metric={metric} values={distribution} trace={trace} units={units} />
        </>
      )}
    </figure>
  )
}

function pathOf(
  points: { timeS: number; value: number }[],
  min: number,
  max: number,
  width: number,
  height: number,
  startS: number,
  endS: number,
): string {
  return points
    .map((point, index) => {
      if (!Number.isFinite(point.value)) return ''
      const prior = points[index - 1]
      const command = index === 0 || !prior || !Number.isFinite(prior.value) ? 'M' : 'L'
      const x = ((point.timeS - startS) / Math.max(1, endS - startS)) * width
      const y = height - ((point.value - min) / (max - min)) * height
      return `${command} ${x} ${y}`
    })
    .filter(Boolean)
    .join(' ')
}

type DistributionBin = { from: number; to: number; seconds: number }

function DistributionHistogram({
  metric,
  values,
  trace,
}: {
  metric: TraceMetric
  values: DistributionBin[]
  trace: ActivityTrace
}) {
  const maximum = Math.max(1, ...values.map((bin) => bin.seconds))
  return (
    <div
      className="activity-workbench__histogram"
      role="img"
      aria-label={`Observed moving ${metricLabel(metric, trace.sport).toLowerCase()} distribution by range, including moving time with no valid reading`}
    >
      {values.map((bin) => (
        <span
          key={`${bin.from}:${bin.to}:${bin.seconds}`}
          style={{ height: `${Math.max(2, (bin.seconds / maximum) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function DistributionTable({
  metric,
  values,
  trace,
  units,
}: {
  metric: TraceMetric
  values: DistributionBin[]
  trace: ActivityTrace
  units: UnitSystem
}) {
  return (
    <details className="activity-workbench__distribution">
      <summary>
        Observed moving distribution for {metricLabel(metric, trace.sport).toLowerCase()}
      </summary>
      <ScrollableTableRegion label={`${metricLabel(metric, trace.sport)} distribution`}>
        <table>
          <caption>
            Observed moving seconds in each value range and moving seconds without a valid value
          </caption>
          <thead>
            <tr>
              <th scope="col">Range</th>
              <th scope="col">Moving seconds</th>
            </tr>
          </thead>
          <tbody>
            {values.map((bin) => (
              <tr key={`${bin.from}:${bin.to}:${bin.seconds}`}>
                <th scope="row">
                  {Number.isFinite(bin.from)
                    ? `${displayValue(metric, bin.from, trace.sport, units, trace.cadenceUnit)}–${displayValue(metric, bin.to, trace.sport, units, trace.cadenceUnit)}`
                    : 'No valid value while moving'}
                </th>
                <td>{bin.seconds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTableRegion>
    </details>
  )
}
