import { HEADLINE_DURATION_S } from '../constants'
import type { Sport } from '../types'
import { ALL_OUT_FRACTION, heartRateFraction } from './effort'
import type { EffortPoint, MaxHeartRates } from './effort'

/*
 * The effort gate: whether a sport's best efforts were hard, before a best is read as capability. One rule,
 * used wherever a best becomes a threshold, a zone, a race time, a level or a durability: see D1 in
 * .claude/stage-d and docs/design/effort-gate.md for the calibration.
 */

/**
 * What a reference heart rate can certify. `trusted` can; `low` is under what any usual maximum is; `habitual` is
 * where the athlete's typical day already sits, so no best can be told from it by a share of it.
 */
export type ReferenceReading = 'trusted' | 'low' | 'habitual'

/**
 * A reference under this, bpm, is not a maximum at any usual age: the mean maximum at 80 is 152 (Tanaka et al.
 * 2001, 208 - 0.7 x age). The one absolute number in the gate; an age and sex band replaces it where the profile is known.
 */
export const REFERENCE_FLOOR_BPM = 150

/**
 * The typical day's peak heart rate over the maximum, from which the maximum is where the athlete lives. A true maximum
 * is reached on few days, so a typical day sits under it. Between the typical-day ratio of hard libraries (under
 * 0.85) and of easy or tempo-only ones (over 0.93) in the synthetic harness; see effort/gate.sim.test.ts.
 */
export const HABITUAL_PEAK_RATIO = 0.9

/** Fewest days with a heart rate for the typical day to say anything; a thinner library is read as trusted. */
export const HABITUAL_MIN_DAYS = 12

/** The per-day peaks of one sport against its maximum, as `typicalDayOf` gives them. */
export interface TypicalDayShare {
  share: number
  days: number
}

const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

/** Whether a share of the reference, as the percent the screen shows it, reaches the hard line. */
export function isHardShare(fraction: number): boolean {
  return Math.round(fraction * 100) >= Math.round(ALL_OUT_FRACTION * 100)
}

/**
 * Each sport's reference read: null without a reference. The reading is that of the sport that supplied the reference,
 * since cycling's may be worked out from running's.
 */
export function readReferences(
  reference: MaxHeartRates,
  observedMax: Record<Sport, number | null>,
  typical: Record<Sport, TypicalDayShare | null>,
): Record<Sport, ReferenceReading | null> {
  const read = (sport: Sport): ReferenceReading | null => {
    const bpm = reference[sport]
    if (bpm === null) return null
    if (bpm < REFERENCE_FLOOR_BPM) return 'low'
    const source = observedMax[sport] === bpm ? sport : OTHER_SPORT[sport]
    const day = typical[source]
    const habitual =
      day !== null && day.days >= HABITUAL_MIN_DAYS && day.share >= HABITUAL_PEAK_RATIO
    return habitual ? 'habitual' : 'trusted'
  }
  return { run: read('run'), ride: read('ride') }
}

export type EffortVerdict = 'hard' | 'notHard' | 'unknown'

/** The gate's answer for one sport and period. */
export interface EffortGate {
  /** `unknown` without a heart rate on the best 20 minutes, a reference or a 20 minute best: nothing is judged. */
  verdict: EffortVerdict
  /** The best 20 minutes' heart rate over the reference; null when it cannot be worked out. */
  share: number | null
  /** What the reference can certify; null without one. */
  reference: ReferenceReading | null
  /** The demonstrated best at the headline duration, in the sport's fit unit (gross metabolic W/kg); null without one. */
  floor: number | null
  /** The cheapest effort that would settle a failed gate: one hard effort of this length, s. */
  neededS: number
}

/** A gate with nothing to judge: no heart rate, no reference. Held by a result before it has efforts. */
export const NO_EFFORT_GATE: EffortGate = {
  verdict: 'unknown',
  share: null,
  reference: null,
  floor: null,
  neededS: HEADLINE_DURATION_S,
}

function pointAt(curve: readonly EffortPoint[], durationS: number): EffortPoint | undefined {
  return curve.find((point) => point.durationS === durationS)
}

/**
 * The gate for a sport. `heartCurve` carries the heart rate of each best (the sport's best curve with set-aside
 * heart rate removed); `fitCurve` is the same bests in the unit the threshold is fitted in, which gives the floor.
 * The best 20 minutes is the point the fit must reach, so it is the effort the gate judges.
 */
export function effortGateOf(
  heartCurve: readonly EffortPoint[],
  fitCurve: readonly { durationS: number; value: number }[],
  referenceBpm: number | null,
  reading: ReferenceReading | null,
): EffortGate {
  const held = fitCurve.find((point) => point.durationS === HEADLINE_DURATION_S)
  const floor = held !== undefined && Number.isFinite(held.value) ? held.value : null
  const base = { reference: reading, floor, neededS: HEADLINE_DURATION_S }
  const share = heartRateFraction(pointAt(heartCurve, HEADLINE_DURATION_S), referenceBpm)
  if (share === null || reading === null) return { ...base, verdict: 'unknown', share }
  const hard = reading === 'trusted' && isHardShare(share)
  return { ...base, verdict: hard ? 'hard' : 'notHard', share }
}

/**
 * Whether a whole activity reached a hard heart rate, from its peak (the highest 30 s mean) against the sport's
 * reference: the judgement of a session, where `effortGateOf` judges a best. `unknown` without a peak or a reference.
 * A reference that cannot certify a maximum never shows a session hard.
 */
export function sessionEffort(
  peakBpm: number | null,
  referenceBpm: number | null,
  reading: ReferenceReading | null,
): EffortVerdict {
  if (peakBpm === null || referenceBpm === null || !(referenceBpm > 0) || reading === null) {
    return 'unknown'
  }
  return reading === 'trusted' && isHardShare(peakBpm / referenceBpm) ? 'hard' : 'notHard'
}
