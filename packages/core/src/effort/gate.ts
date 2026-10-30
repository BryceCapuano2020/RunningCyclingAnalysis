import { CP_FIT_REACH_TOLERANCE, HEADLINE_DURATION_S } from '../constants'
import { ALL_OUT_FRACTION } from './effort'
import type { ReferenceReading, ReferenceSource } from './reference'
import type { Sport } from '../types'

/*
 * The effort gate: whether a sport's best efforts were hard, before a best is read as capability. One rule,
 * used wherever a best becomes a threshold, a zone, a race time, a level or a durability: see D1 in
 * .claude/stage-d and docs/design/effort-gate.md for the calibration. The references it reads are judged in reference.ts.
 */

/** Whether a share of the reference, as the percent the screen shows it, reaches the hard line. */
export function isHardShare(fraction: number): boolean {
  return Math.round(fraction * 100) >= Math.round(ALL_OUT_FRACTION * 100)
}

export type EffortVerdict = 'hard' | 'notHard' | 'unknown'

/** Why a gate could not judge: no heart rate on the best, too few days to set a reference, or no 20 minute best. */
export type Unchecked = 'noHeartRate' | 'thin' | 'noBest'

/** The gate's answer for one sport and period. */
export interface EffortGate {
  /** `unknown` when it cannot judge (see `unchecked`): nothing is withheld, and the screens say the effort was not checked. */
  verdict: EffortVerdict
  /** Why it could not judge; null when it did. */
  unchecked: Unchecked | null
  /** The judged 20 minutes' heart rate over the reference; null when it cannot be worked out. */
  share: number | null
  /** What the reference can certify; null without one. */
  reference: ReferenceReading | null
  /** The reference heart rate the share is of, bpm; null without one. */
  referenceBpm: number | null
  /** Where it came from, and for one worked out from the activities, the sport whose days supplied it. */
  referenceSource: ReferenceSource | null
  referenceFrom: Sport | null
  /**
   * The demonstrated best shown in place of a withheld threshold, in the sport's fit unit (gross metabolic W/kg) with the
   * duration it was held for: the best 30 minutes (what a threshold is said to be held for) where the curve has one, else the
   * best 20 minutes. Null without either.
   */
  floor: { durationS: number; value: number } | null
  /**
   * What would settle a failed gate: one hard effort of this length, s, when the reference can certify one. Null when it
   * cannot (low, habitual or high): then a hard effort is not the missing piece, the reference is.
   */
  neededS: number | null
  /**
   * The activities that reached a hard heart rate (`hard`), and the long ones whose average heart rate was high
   * (`endurance`): what a race prediction may carry a time from. Empty where the gate could not judge.
   */
  sessions: { hard: string[]; endurance: string[] }
}

/** A gate with nothing to judge: no heart rate, no reference. Held by a result before it has efforts. */
export const NO_EFFORT_GATE: EffortGate = {
  verdict: 'unknown',
  unchecked: 'noBest',
  share: null,
  reference: null,
  referenceBpm: null,
  referenceSource: null,
  referenceFrom: null,
  floor: null,
  neededS: HEADLINE_DURATION_S,
  sessions: { hard: [], endurance: [] },
}

/** One activity's 20 minute best: its value in the fit unit and the heart rate over the window; null without one. */
export interface TwentyMinutePoint {
  value: number
  heartRate: number | null
  /** Whether the value is a power meter's measurement, not a model's estimate (a run's pace counts as measured). */
  measured: boolean
}

/**
 * The 20 minute efforts that stand for a sport's best: the best, and any other within the fit's reach tolerance of it. Of
 * these the one with the highest heart rate is the one judged, since a headwind or a hill moves the best by a few percent and
 * says nothing of effort.
 */
export function judgedTwentyMinutes(points: readonly TwentyMinutePoint[]): {
  best: number | null
  heartRate: number | null
  /** Whether the judged effort is a measurement; where none has a heart rate, whether the best is. */
  measured: boolean
} {
  let best: number | null = null
  for (const { value } of points) {
    if (Number.isFinite(value) && (best === null || value > best)) best = value
  }
  if (best === null) return { best: null, heartRate: null, measured: false }
  let heartRate: number | null = null
  let measured = false
  let bestMeasured = false
  for (const point of points) {
    const near = Number.isFinite(point.value) && point.value >= best * (1 - CP_FIT_REACH_TOLERANCE)
    if (point.value === best) bestMeasured = point.measured
    if (near && point.heartRate !== null && (heartRate === null || point.heartRate > heartRate)) {
      heartRate = point.heartRate
      measured = point.measured
    }
  }
  return { best, heartRate, measured: heartRate === null ? bestMeasured : measured }
}

/** What a gate reads of a sport's reference. */
export interface GateReference {
  bpm: number | null
  reading: ReferenceReading | null
  source: ReferenceSource | null
  from: Sport | null
}

/**
 * The gate for a sport, from its 20 minute efforts. `floor` is the demonstrated best the surfaces show in place of a
 * withheld threshold.
 */
export function effortGateOf(
  points: readonly TwentyMinutePoint[],
  floor: EffortGate['floor'],
  reference: GateReference,
  sessions: EffortGate['sessions'],
): EffortGate {
  const { best, heartRate } = judgedTwentyMinutes(points)
  const base = {
    reference: reference.reading,
    referenceBpm: reference.bpm,
    referenceSource: reference.source,
    referenceFrom: reference.from,
    floor,
  }
  const share =
    heartRate !== null && reference.bpm !== null && reference.bpm > 0
      ? heartRate / reference.bpm
      : null
  const unknown = (unchecked: Unchecked): EffortGate => ({
    ...base,
    verdict: 'unknown',
    unchecked,
    share,
    neededS: HEADLINE_DURATION_S,
    sessions: { hard: [], endurance: [] },
  })
  if (best === null) return unknown('noBest')
  if (reference.reading === 'thin') return unknown('thin')
  if (share === null || reference.reading === null) return unknown('noHeartRate')
  const trusted = reference.reading === 'trusted'
  return {
    ...base,
    verdict: trusted && isHardShare(share) ? 'hard' : 'notHard',
    unchecked: null,
    share,
    neededS: trusted ? HEADLINE_DURATION_S : null,
    sessions,
  }
}
