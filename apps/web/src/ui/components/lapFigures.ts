import { QUALITY_THRESHOLDS } from '@rca/core/quality'
import { restsOf } from '@rca/core/splits'
import type { ActivityTrace } from '@rca/core/workbench'

/** One lap's span in whole seconds, its distance when it can be known, and the seconds it was run. */
export interface LapFigures {
  startS: number
  endS: number
  /** Metres between the lap's two boundary samples, or null when a boundary is not a recorded sample. */
  distanceM: number | null
  /** The lap's seconds less its rests, which is the time its pace is read over. */
  timedS: number
  /** Metres the lap gained in its rests, which are in its distance but not in its time. */
  restM: number
  /** The lap holds seconds the device did not record, across which the distance may have stepped. */
  gapped: boolean
}

const kept = new WeakMap<ActivityTrace, LapFigures[]>()

/** The seconds the device was timing: neither paused nor in a gap it did not record. */
function movingMask(trace: ActivityTrace): Uint8Array {
  const moving = new Uint8Array(trace.paused.length)
  for (let i = 0; i < moving.length; i++) {
    moving[i] = trace.paused[i] !== 1 && trace.unrecorded[i] !== 1 ? 1 : 0
  }
  return moving
}

/**
 * The metres between the lap's boundary samples. The final second has no closing sample, so a lap
 * that reaches the end measures to the last one. A gap inside the lap does not make it unknown, because
 * the distance is held through the gap and then stepped, so the two boundary samples still bound the
 * lap: it is unknown only when a boundary sample itself lies in a gap, or the distance runs backwards.
 */
function distanceBetween(trace: ActivityTrace, startS: number, closingS: number): number | null {
  if (closingS <= startS) return null
  if (trace.unrecorded[startS] === 1 || trace.unrecorded[closingS] === 1) return null
  const first = trace.distance[startS]!
  const closing = trace.distance[closingS]!
  return Number.isFinite(first) && Number.isFinite(closing) && closing >= first
    ? closing - first
    : null
}

/**
 * The device's laps clipped to the trace's whole seconds, without any that is empty, with each lap's
 * distance and timed seconds. A rest the lap holds, a pause or a gap the runner stood through, is not
 * in its time, as it is not in a split's, and the metres it gained are not in the pace; a gap the
 * distance stepped across stays, so the pace of a lap that holds one is never faster than the runner
 * went. The final second has no closing sample, so a lap that reaches it is timed to the one before.
 */
export function lapFiguresOf(trace: ActivityTrace): LapFigures[] {
  const cached = kept.get(trace)
  if (cached) return cached
  const { rest, gain } = restsOf(trace.distance, movingMask(trace))
  const max = Math.floor(trace.durationS)
  const figures = trace.laps
    .map((lap) => ({ startS: Math.max(0, lap.startS), endS: Math.min(lap.endS, max) }))
    .filter((lap) => lap.endS > lap.startS)
    .map(({ startS, endS }) => {
      const closingS = endS >= trace.durationS ? trace.durationS - 1 : endS
      let timedS = Math.max(0, closingS - startS)
      let restM = 0
      let gapped = false
      for (let i = startS; i < closingS; i++) {
        timedS -= rest[i]!
        restM += gain[i]!
        gapped ||= trace.unrecorded[i] === 1
      }
      return {
        startS,
        endS,
        distanceM: distanceBetween(trace, startS, closingS),
        timedS,
        restM,
        gapped,
      }
    })
  kept.set(trace, figures)
  return figures
}

/**
 * The mean heart rate over a lap: every second with a reading between the lowest and highest a person
 * could have (QUALITY_THRESHOLDS), apart from seconds the device did not record. Paused seconds count,
 * as they do in the splits. The splits also drop the margins around a dropout or a spike that the
 * quality check finds, which the trace cannot, so a lap's mean can differ from a split's by a beat.
 * Null without any reading.
 */
export function lapHeartRate(trace: ActivityTrace, startS: number, endS: number): number | null {
  const stream = trace.streams.heartRate
  if (stream === undefined) return null
  const { minValidBpm, hrSpike } = QUALITY_THRESHOLDS
  let count = 0
  let sum = 0
  for (let i = startS; i < endS; i++) {
    const bpm = stream[i]!
    if (trace.unrecorded[i] === 1 || !(bpm >= minValidBpm && bpm <= hrSpike.maxBpm)) continue
    count++
    sum += bpm
  }
  return count > 0 ? sum / count : null
}
