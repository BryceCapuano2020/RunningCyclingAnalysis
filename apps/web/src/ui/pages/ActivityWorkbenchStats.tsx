import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import { summarizeSelection } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatTotalTime } from '@rca/core/units'
import { displayValue, metricLabel } from './workbenchFormat'
import { ScrollableTableRegion } from './ScrollableTableRegion'

const METRIC_ORDER: TraceMetric[] = [
  'speed',
  'power',
  'heartRate',
  'cadence',
  'altitude',
  'temperature',
]

export function SelectionStats({
  trace,
  startS,
  endS,
  units,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  units: UnitSystem
}) {
  const summary = summarizeSelection(trace, startS, endS)
  const distance =
    summary.distanceM === null
      ? 'Not available across an unrecorded gap'
      : formatDistance(summary.distanceM, units)
  return (
    <div className="activity-workbench__stats">
      <h3>Selected interval summary</h3>
      <dl className="activity-workbench__summary">
        <div>
          <dt>Elapsed time</dt>
          <dd>{formatTotalTime(summary.elapsedS)}</dd>
        </div>
        <div>
          <dt>Moving time</dt>
          <dd>{formatTotalTime(summary.movingS)}</dd>
        </div>
        <div>
          <dt>Recorded time</dt>
          <dd>{formatTotalTime(summary.recordedS)}</dd>
        </div>
        <div>
          <dt>Paused time</dt>
          <dd>{formatTotalTime(summary.recordedS - summary.movingS)}</dd>
        </div>
        <div>
          <dt>Unrecorded time</dt>
          <dd>{formatTotalTime(summary.elapsedS - summary.recordedS)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{distance}</dd>
        </div>
      </dl>
      <ScrollableTableRegion label="Selected interval moving measure statistics">
        <table>
          <caption>Measure statistics during moving time in the selected interval</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Mean while moving</th>
              <th scope="col">Minimum while moving</th>
              <th scope="col">Maximum while moving</th>
              <th scope="col">Moving seconds with a reading</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ORDER.filter((metric) => summary.metrics[metric]).map((metric) => {
              const stats = summary.metrics[metric]
              if (!stats) return null
              const missing = 'Not recorded'
              const format = (value: number | null) =>
                value === null
                  ? missing
                  : displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
              return (
                <tr key={metric}>
                  <th scope="row">{metricLabel(metric, trace.sport)}</th>
                  <td>{format(stats.mean)}</td>
                  <td>{format(stats.min)}</td>
                  <td>{format(stats.max)}</td>
                  <td>{stats.seconds}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollableTableRegion>
    </div>
  )
}
