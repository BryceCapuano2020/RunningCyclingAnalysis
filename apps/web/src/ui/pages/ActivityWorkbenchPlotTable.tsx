import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatRecordTime } from '@rca/core/units'
import { ChartTable } from '../charts/ChartTable'
import { axisFor, selectionOf } from './workbenchData'
import { displayValue, metricLabel, rangeHeadings, readingRange } from './workbenchFormat'
import { beyondAxis, beyondNote, noReadingLabel } from './workbenchText'

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

/**
 * The text twin of one row of the stack: the measure over the interval section by section, then what the
 * drawing marks without words: moving time with no reading, and readings past the axis.
 */
export function ChannelTable({
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
  const selection = selectionOf(trace, startS, endS)
  const missing = Math.max(0, selection.movingS - (selection.metrics[metric]?.seconds ?? 0))
  const axis = axisFor(trace, metric, startS, endS)
  const beyond = axis === null ? null : beyondNote(beyondAxis(metric, trace, units, axis))
  return (
    <div className="activity-workbench__channel-table">
      <ChartTable
        caption={`${label} by section of the interval`}
        columns={['From', 'Average', ...rangeHeadings(metric, trace.sport)]}
        rows={sections}
      />
      {missing > 0 && (
        <p className="muted">
          {noReadingLabel(metric, trace.sport)} for {missing} s of moving time.
        </p>
      )}
      {beyond !== null && <p className="muted">{beyond}</p>}
    </div>
  )
}
