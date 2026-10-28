import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { distributionFor, selectionOf } from './workbenchData'
import { binRange, noReadingLabel } from './workbenchText'
import { displayValue, metricLabel, readingRange } from './workbenchFormat'

/**
 * How the interval's moving time was spread across the measure, as bars from its lowest reading to its
 * highest. Moving time with no reading is stated beneath, not drawn, so no bar stands for it.
 */
export function PlotDistribution({
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
  const bins = distributionFor(trace, metric, startS, endS)
  const selection = selectionOf(trace, startS, endS)
  const missing = Math.max(0, selection.movingS - (selection.metrics[metric]?.seconds ?? 0))
  if (bins.length === 0)
    return missing > 0 ? (
      <p className="muted">
        {noReadingLabel(metric, trace.sport)} for {missing} s of moving time.
      </p>
    ) : null
  const maximum = Math.max(1, ...bins.map((bin) => bin.seconds))
  const busiest = bins.reduce((best, bin) => (bin.seconds > best.seconds ? bin : best), bins[0]!)
  const { lowest, highest } = readingRange(
    metric,
    trace.sport,
    Math.min(...bins.map((bin) => bin.from)),
    Math.max(...bins.map((bin) => bin.to)),
  )
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  return (
    <div className="activity-workbench__distribution">
      <div
        className="activity-workbench__histogram"
        role="img"
        aria-label={`Time at each ${metricLabel(metric, trace.sport).toLowerCase()}, from ${text(lowest)} to ${text(highest)}. Most time at ${binRange(busiest, metric, trace, units)}.`}
      >
        {bins.map((bin) => (
          <span
            key={`${bin.from}:${bin.to}`}
            style={{ height: `${Math.max(2, (bin.seconds / maximum) * 100)}%` }}
          />
        ))}
      </div>
      <div className="activity-workbench__axis" aria-hidden="true">
        <span>{text(lowest)}</span>
        <span>{text(highest)}</span>
      </div>
      {missing > 0 && (
        <p className="muted">
          {noReadingLabel(metric, trace.sport)} for {missing} s of moving time.
        </p>
      )}
    </div>
  )
}
