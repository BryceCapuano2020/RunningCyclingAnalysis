import { isTraceObservation } from '../workbench/selection'
import type { ActivityTrace, MaskedMetric } from '../workbench/types'
import type { ZoneMeasure } from './schemes'
import { EDGE_EPSILON } from './timeInZones'
import type { Zone } from './zones'

/** The recorded stream each zone measure reads: a pace's zones are cut in speed. */
export const TRACE_METRIC_OF: Record<ZoneMeasure, MaskedMetric> = {
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
 * once, in the zone that holds its reading, so there is no bin to split. A reading counts the same way
 * as in `secondsByZone`: at or above a zone's floor and below its ceiling. A second the trace marks
 * unusable (a flagged heart-rate spike) is left out, as the digest's distributions leave it out, so an
 * interval of the whole activity matches the sport page. The same holds for pace over a stretch where speed
 * and distance disagree: the digest lowers the speed there, and the trace carries the lowered speed (`zoneSpeed`). An interval is whole seconds from `startS` up
 * to, not including, `endS`.
 */
export function traceTimeInZones(
  trace: ActivityTrace,
  measure: ZoneMeasure,
  zones: readonly Zone[],
  startS: number,
  endS: number,
): TraceZoneTime {
  const metric = TRACE_METRIC_OF[measure]
  // Pace is cut from the speed the digest reads, which differs from the recorded one over a stretch where the
  // file's speed and distance disagree.
  const stream = (metric === 'speed' ? trace.zoneSpeed : undefined) ?? trace.streams[metric]
  const seconds = new Array<number>(zones.length).fill(0)
  let total = 0
  if (stream === undefined) return { seconds, total }
  const unusable = trace.unusable?.[metric]
  const last = zones.length - 1
  for (let i = startS; i < endS; i++) {
    if (unusable?.[i] === 1 || !isTraceObservation(trace, metric, i)) continue
    const value = stream[i]!
    if (!Number.isFinite(value)) continue
    let zone = 0
    while (zone < last && value >= zones[zone]!.high! - EDGE_EPSILON) zone++
    seconds[zone]!++
    total++
  }
  return { seconds, total }
}
