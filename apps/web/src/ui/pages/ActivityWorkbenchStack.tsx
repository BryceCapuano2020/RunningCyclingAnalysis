import { useCallback, useMemo } from 'react'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { TimeSeriesStack } from '../charts/TimeSeriesStack'
import { ChannelTable } from './ActivityWorkbenchPlotTable'
import {
  channelsFor,
  headAt,
  lapChoicesOf,
  stackDescription,
  timelineMarks,
} from './workbenchChannels'
import { axisFor } from './workbenchData'
import { metricLabel } from './workbenchFormat'

/** "Pace, measured power and heart rate over time": the first name as written, the rest in lower case. */
function titleOf(labels: readonly string[]): string {
  const [first = '', ...rest] = labels
  const names = [first, ...rest.map((label) => label.toLowerCase())]
  const list =
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} over time`
}

/**
 * The chosen measures as one aligned stack over the interval, each with its own colour and a text twin,
 * with a line for each chosen measure that has no reading in it.
 */
export function ActivityWorkbenchStack({
  trace,
  units,
  metrics,
  startS,
  endS,
}: {
  trace: ActivityTrace
  units: UnitSystem
  metrics: readonly TraceMetric[]
  startS: number
  endS: number
}) {
  const present = useMemo(
    () => metrics.filter((metric) => axisFor(trace, metric, startS, endS) !== null),
    [trace, metrics, startS, endS],
  )
  const absent = metrics.filter((metric) => !present.includes(metric))
  const channels = useCallback(
    (plotPx: number, ticks: number) =>
      channelsFor(trace, present, units, startS, endS, plotPx, ticks),
    [trace, present, units, startS, endS],
  )
  const head = useCallback((second: number) => headAt(trace, units, second), [trace, units])
  const marks = useMemo(() => timelineMarks(trace), [trace])
  const { laps } = useMemo(() => lapChoicesOf(trace), [trace])
  return (
    <>
      {present.length > 0 && (
        <TimeSeriesStack
          title={titleOf(present.map((metric) => metricLabel(metric, trace.sport)))}
          description={stackDescription(trace, present, units, startS, endS)}
          startS={startS}
          endS={endS}
          channels={channels}
          laps={laps}
          marks={marks}
          head={head}
          tables={present.map((metric) => (
            <ChannelTable
              key={metric}
              trace={trace}
              metric={metric}
              units={units}
              startS={startS}
              endS={endS}
            />
          ))}
        />
      )}
      {absent.map((metric) => (
        <p key={metric} className="secondary">
          {metricLabel(metric, trace.sport)}: none in this interval.
        </p>
      ))}
    </>
  )
}
