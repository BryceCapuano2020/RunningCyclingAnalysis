import type { Sport } from '../types'

export type CadenceUnit = 'steps/min' | 'rev/min' | 'unknown'

/** Streams the detail view can show. `cadenceUnit` identifies cadence units when known. */
export type TraceMetric = 'speed' | 'heartRate' | 'power' | 'cadence' | 'altitude' | 'temperature'

/** The streams the quality assessment can leave seconds of out: the ones a zone is cut from. */
export type MaskedMetric = 'speed' | 'heartRate' | 'power'

/** Device lap boundaries in elapsed seconds, as a half-open integer range. */
export interface ActivityLap {
  startS: number
  endS: number
  label?: string
}

/** Compact, serializable evidence for one activity's detail workbench. */
export interface ActivityTrace {
  version: 1
  activityId: string
  sport: Sport
  /** Omitted for legacy traces, whose cadence unit follows sport; `unknown` preserves GPX ambiguity. */
  cadenceUnit?: CadenceUnit
  durationS: number
  /** Cumulative metres, at the one-second sample boundaries. */
  distance: Float64Array
  paused: Uint8Array
  unrecorded: Uint8Array
  /** Recorded streams only; virtual power is never included. Missing samples are NaN. */
  streams: Partial<Record<TraceMetric, Float32Array>>
  /**
   * Per stream, 1 for a second the quality assessment left out (a heart-rate spike, a power spike), the
   * seconds the digest's distributions leave out. Only streams that have such seconds appear. Absent on a
   * trace built without the assessment, which reads every reading.
   */
  unusable?: Partial<Record<MaskedMetric, Uint8Array>>
  /**
   * The speed the digest cuts pace zones from, where it is not `streams.speed`: lowered over the stretches
   * where the file's speed and distance disagree. Present only for such an activity; zones read it in
   * place of the recorded speed so that both pages count the same pace.
   */
  zoneSpeed?: Float32Array
  laps: ActivityLap[]
}

export interface MetricSelectionSummary {
  /** Mean over valid, recorded seconds while moving; paused and unrecorded seconds are excluded. */
  mean: number | null
  min: number | null
  max: number | null
  /** Moving seconds with a finite, in-range value. */
  seconds: number
}

export interface SelectionSummary {
  startS: number
  endS: number
  elapsedS: number
  /** Seconds neither paused nor unrecorded. */
  movingS: number
  /** Seconds that were not in a device recording gap, including pauses. */
  recordedS: number
  /** Null if the selected distance crosses an unknown or unrecorded boundary. */
  distanceM: number | null
  /** Moving-time summaries. Device pauses remain represented by elapsedS/recordedS. */
  metrics: Partial<Record<TraceMetric, MetricSelectionSummary>>
}
