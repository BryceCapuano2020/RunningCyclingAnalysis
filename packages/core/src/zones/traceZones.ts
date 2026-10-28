import { isTraceObservation } from '../workbench/selection'
import type { ActivityTrace, TraceMetric } from '../workbench/types'
import type { ZoneMeasure } from './schemes'
import type { Zone } from './zones'

/** The recorded stream each zone measure reads: a pace's zones are cut in speed. */
export const TRACE_METRIC_OF: Record<ZoneMeasure, TraceMetric> = {
  power: 'power',
  heartRate: 'heartRate',
  pace: 'speed',
}

/** The seconds of a selection in each zone, and the seconds that had a reading at all. */
export interface TraceZoneTime {
  /** Per zone, lowest effort first. */
  seconds: number[]
  /** Moving seconds with a reading, the sum of `seconds`. */
  total: number
}

/**
 * The seconds of an interval of a trace in each zone. Each moving second with a reading is counted
 * once, in the zone that holds its reading, so there is no bin to split. An interval is whole seconds
 * from `startS` up to, not including, `endS`.
 */
export function traceTimeInZones(
  trace: ActivityTrace,
  measure: ZoneMeasure,
  zones: readonly Zone[],
  startS: number,
  endS: number,
): TraceZoneTime {
  const metric = TRACE_METRIC_OF[measure]
  const stream = trace.streams[metric]
  const seconds = new Array<number>(zones.length).fill(0)
  let total = 0
  if (stream === undefined) return { seconds, total }
  const last = zones.length - 1
  for (let i = startS; i < endS; i++) {
    if (!isTraceObservation(trace, metric, i)) continue
    const value = stream[i]!
    let zone = 0
    while (zone < last && value >= zones[zone]!.high!) zone++
    seconds[zone]!++
    total++
  }
  return { seconds, total }
}
