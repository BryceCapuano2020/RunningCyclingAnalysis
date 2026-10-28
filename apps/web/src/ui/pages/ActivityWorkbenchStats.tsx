import type { ActivityTrace, MetricSelectionSummary, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatRecordTime, formatTotalTime } from '@rca/core/units'
import { ChartTable } from '../charts/ChartTable'
import { selectionOf } from './workbenchData'
import {
  METRIC_ORDER,
  SPORT_READING,
  displayValue,
  isPaceReading,
  metricLabel,
  rangeHeadings,
  readingRange,
} from './workbenchFormat'

const NONE = 'None in this interval'

const MOVING_CAPTION =
  'While moving in the selected interval. Time is how long each measure had a reading.'
/** A pace table's averages leave out the stops, which are not paces, so it says so. */
const PACE_CAPTION =
  'Pace in the selected interval, leaving out stops. Time is how long it had a reading.'

/** One table of the summary: the measures that share their headings for the lowest and highest reading. */
interface StatGroup {
  caption: string
  columns: string[]
  rows: string[][]
}

function rowOf(
  metric: TraceMetric,
  trace: ActivityTrace,
  units: UnitSystem,
  stats: MetricSelectionSummary,
): string[] {
  const label = metricLabel(metric, trace.sport)
  if (stats.mean === null || stats.min === null || stats.max === null)
    return [label, NONE, NONE, NONE, formatRecordTime(0)]
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  const { lowest, highest } = readingRange(metric, trace.sport, stats.min, stats.max)
  return [label, text(stats.mean), text(lowest), text(highest), formatRecordTime(stats.seconds)]
}

/**
 * The shown measures as tables. A pace is read fastest first, so it names its extremes Fastest and
 * Slowest where the other measures say Lowest and Highest, and a table has one set of headings: the
 * pace is a table of its own.
 */
function groupsOf(
  trace: ActivityTrace,
  units: UnitSystem,
  metrics: readonly TraceMetric[],
  summary: ReturnType<typeof selectionOf>,
): StatGroup[] {
  const groups: StatGroup[] = []
  for (const metric of METRIC_ORDER.filter((candidate) => metrics.includes(candidate))) {
    const stats = summary.metrics[metric]
    if (!stats) continue
    const [lowest, highest] = rangeHeadings(metric, trace.sport)
    const row = rowOf(metric, trace, units, stats)
    const group = groups.find((candidate) => candidate.columns[2] === lowest)
    if (group) {
      group.rows.push(row)
      continue
    }
    const leavesOutStops =
      isPaceReading(metric, trace.sport) && SPORT_READING[trace.sport].minSpeedMs > 0
    groups.push({
      caption: leavesOutStops ? PACE_CAPTION : MOVING_CAPTION,
      columns: ['Measure', 'Average', lowest, highest, 'Time'],
      rows: [row],
    })
  }
  return groups
}

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
  // The activity header's figure for the interval: the distance over the moving time, stops included.
  if (summary.distanceM !== null && summary.distanceM > 0 && summary.movingS > 0) {
    const reading = SPORT_READING[trace.sport]
    tiles.push([
      `Average ${reading.speedLabel.toLowerCase()}`,
      reading.speedText(summary.distanceM / summary.movingS, units),
    ])
  }
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
      {groupsOf(trace, units, metrics, summary).map((group) => (
        <ChartTable
          key={group.columns[2]}
          caption={group.caption}
          columns={group.columns}
          rows={group.rows}
        />
      ))}
    </div>
  )
}
