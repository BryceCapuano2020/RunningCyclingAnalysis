import type { ActivityTrace, MetricSelectionSummary, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatRecordTime, formatTotalTime } from '@rca/core/units'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChartTable } from '../charts/ChartTable'
import { useMinWidth } from './useMinWidth'
import { movingAverageSpeed, selectionOf, typicalBand } from './workbenchData'
import {
  METRIC_ORDER,
  SPORT_READING,
  displayValue,
  isPaceReading,
  metricLabel,
  readingRange,
} from './workbenchFormat'
import { readingOf } from './workbenchScale'

const NONE = 'None in this interval'

const MOVING_CAPTION =
  'While moving in the selected interval. Typical range is the 5th to 95th percentile. Time is how long each measure had a reading.'
/** A speed's average is the figure the header gives, the distance over the moving time, and the table says so. */
const SPEED_CAPTION =
  'Speed in the selected interval. Average is the distance over the moving time. Typical range is the 5th to 95th percentile. Time is how long it had a reading.'
/** A pace's typical range leaves out the stops, which are not paces, so it says so. */
const PACE_CAPTION =
  'Pace in the selected interval. Average is the distance over the moving time. Typical range leaves out stops and is the 5th to 95th percentile. Time is how long it had a reading.'

/** One table of the summary: the measures that share a caption. */
interface StatGroup {
  caption: string
  key: string
  rows: string[][]
}

const COLUMNS = ['Measure', 'Average', 'Typical range', 'Time']

function rowOf(
  metric: TraceMetric,
  trace: ActivityTrace,
  units: UnitSystem,
  stats: MetricSelectionSummary,
  band: { low: number; high: number } | null,
  /** A speed's average: the distance over the moving time, the figure the page gives everywhere else. */
  average: number | null,
): string[] {
  const label = metricLabel(metric, trace.sport)
  if (stats.mean === null || band === null) return [label, NONE, NONE, formatRecordTime(0)]
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  // A pace is read fastest first, so its range runs from the faster end, which is the higher speed.
  const { lowest, highest } = readingRange(metric, trace.sport, band.low, band.high)
  const first = readingOf(metric, lowest, trace.sport, units, trace.cadenceUnit)
  const last = readingOf(metric, highest, trace.sport, units, trace.cadenceUnit)
  const range =
    first.value === last.value
      ? text(lowest)
      : `${first.value} to ${last.value}${last.unit === '' ? '' : ` ${last.unit}`}`
  return [label, text(average ?? stats.mean), range, formatRecordTime(stats.seconds)]
}

/**
 * The shown measures as tables: each one's average, the range most of its readings lay in, and the time it had
 * readings. A pace is a table of its own, since its average leaves out the stops and says so.
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
    const row = rowOf(
      metric,
      trace,
      units,
      stats,
      typicalBand(trace, metric, summary.startS, summary.endS),
      metric === 'speed' ? movingAverageSpeed(summary) : null,
    )
    const leavesOutStops =
      isPaceReading(metric, trace.sport) && SPORT_READING[trace.sport].minSpeedMs > 0
    // A speed or pace is a table of its own, as its caption says how its mean differs from the figure above.
    const key = metric === 'speed' ? 'speed' : 'others'
    const caption =
      key === 'others' ? MOVING_CAPTION : leavesOutStops ? PACE_CAPTION : SPEED_CAPTION
    const group = groups.find((candidate) => candidate.key === key)
    if (group) group.rows.push(row)
    else groups.push({ key, caption, rows: [row] })
  }
  return groups
}

/** The figures of the interval, as tiles: its times, its distance and its average pace or speed. */
function SelectionTiles({
  trace,
  summary,
  units,
  heading,
}: {
  trace: ActivityTrace
  summary: ReturnType<typeof selectionOf>
  units: UnitSystem
  heading: ReactNode
}) {
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
  const average = movingAverageSpeed(summary)
  if (average !== null) {
    const reading = SPORT_READING[trace.sport]
    tiles.push([`Average ${reading.speedLabel.toLowerCase()}`, reading.speedText(average, units)])
  }
  return (
    <div className="activity-workbench__stats activity-workbench__stats--tiles">
      {heading}
      <dl className="activity-workbench__summary">
        {tiles.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** From this width the timeline and the figures stand side by side, and the interval's tiles go to the column beside it. */
const WIDE_MIN_WIDTH_PX = 1100

export function SelectionStats({
  trace,
  startS,
  endS,
  units,
  metrics,
  tilesHost,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  units: UnitSystem
  /** The measures shown, which the table follows. */
  metrics: readonly TraceMetric[]
  /** The column beside the timeline, where the tiles are drawn when the page is wide enough to have one. */
  tilesHost?: HTMLElement | null
}) {
  const wide = useMinWidth(WIDE_MIN_WIDTH_PX)
  const summary = selectionOf(trace, startS, endS)
  const inColumn = wide && tilesHost !== null && tilesHost !== undefined
  // Beside the timeline the page already shows the whole activity's figures, so the column holds a part of it only.
  const whole = startS === 0 && endS >= Math.floor(trace.durationS)
  const tiles = (
    <SelectionTiles
      trace={trace}
      summary={summary}
      units={units}
      heading={inColumn ? <h2>Selected interval</h2> : <h3>Interval summary</h3>}
    />
  )
  return (
    <>
      {inColumn ? !whole && createPortal(tiles, tilesHost) : tiles}
      <div className="activity-workbench__stats">
        {groupsOf(trace, units, metrics, summary).map((group) => (
          <ChartTable key={group.key} caption={group.caption} columns={COLUMNS} rows={group.rows} />
        ))}
      </div>
    </>
  )
}
