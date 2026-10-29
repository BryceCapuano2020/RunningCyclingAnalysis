import { FINDINGS } from './constants'
import { madSd, median, signConfidenceFromAgree, signConfidenceFromZ } from './stats'
import type { SignEvidence, Support, SurpriseInput } from './types'

function signConfidence(evidence: SignEvidence): number {
  return evidence.kind === 'agree'
    ? signConfidenceFromAgree(evidence.share)
    : signConfidenceFromZ(evidence.z, evidence.degrees)
}

/**
 * How sure the finding's sign is: signConfidence x sufficiency x robustness, 0 to 1. Sufficiency is the
 * share of the activities it needs that it has; robustness is 1 when no one activity carries the sign and
 * a half when one does. A detector's cap, when it has one, is the most it can reach.
 */
export function confidenceOf(support: Support): number {
  const sufficiency = support.nNeeded > 0 ? Math.min(1, support.n / support.nNeeded) : 1
  const confidence = signConfidence(support.sign) * sufficiency * (support.robust ? 1 : 0.5)
  return Number.isFinite(confidence) ? Math.min(confidence, support.cap ?? 1) : 0
}

/** How far the effect strays from what is usual, and the surprise that comes of it before the bar asks for a minimum. */
export interface SurpriseReading {
  /** The distance from usual in spreads: |effect - median of the previous 26| / spread. */
  z: number
  /** 0 to 1, as surpriseReading describes, without the minimum distance. */
  value: number
}

/**
 * How surprising the effect is against the athlete's own history:
 * 0.5 min(1, z/3) + 0.5 rarity. Both are measured from what is usual, the median of the same comparison
 * in the previous 26 weeks, so a steady ramp, whose every comparison is the same, scores near nothing
 * however large it is: z is the effect's distance from usual over the MAD-based spread of those 26,
 * and rarity is the share of the athlete's past comparisons that strayed less from usual. With less
 * than 26 weeks of past, rarity is not known, so it is the z term alone, at most 0.6. With too few
 * weeks to judge a spread at all, zero.
 */
export function surpriseReading(input: SurpriseInput | null): SurpriseReading {
  const none = { z: 0, value: 0 }
  if (input === null || !Number.isFinite(input.effect)) return none
  const noise = input.noise.filter(Number.isFinite)
  if (noise.length < FINDINGS.minNoiseWeeks) return none
  const usual = median(noise)
  const spread = Math.max(madSd(noise), input.minSd ?? 0)
  const stray = Math.abs(input.effect - usual)
  const z = spread > 0 ? stray / spread : stray > 0 ? Number.POSITIVE_INFINITY : 0
  const zTerm = Math.min(1, z / 3)
  if (input.past.length < FINDINGS.noiseWeeks) {
    return { z, value: Math.min(FINDINGS.shortHistorySurpriseCap, zTerm) }
  }
  const less = input.past.filter((p) => Math.abs(p - usual) < stray).length
  return { z, value: 0.5 * zTerm + 0.5 * (less / input.past.length) }
}

/**
 * The surprise a finding needs to be spoken for the first time: the reading's value, but zero unless the
 * effect is at least FINDINGS.minSurpriseZ spreads from usual. Rarity is a percentile of the athlete's own
 * past, so in a history where nothing changed it is spread evenly from 0 to 1 and, with z, would call
 * about half the weeks surprising; the distance is what says an effect is out of the ordinary.
 */
export function surpriseOf(input: SurpriseInput | null): number {
  const { z, value } = surpriseReading(input)
  return z >= FINDINGS.minSurpriseZ ? value : 0
}

/**
 * The surprise input for a comparison of a weekly series with itself `lagWeeks` earlier (latest against
 * about eight weeks ago): the effect now, and the same comparison at every earlier week, the last 26 of
 * which are the noise. `weekly` is oldest first, its last value the latest week's; missing weeks are NaN
 * and leave their comparisons out.
 */
export function surpriseInputOf(
  weekly: readonly number[],
  lagWeeks: number,
  minSd?: number,
): SurpriseInput | null {
  const last = weekly.length - 1
  if (last < lagWeeks) return null
  const effect = weekly[last]! - weekly[last - lagWeeks]!
  if (!Number.isFinite(effect)) return null
  const past: number[] = []
  for (let i = lagWeeks; i < last; i++) {
    const change = weekly[i]! - weekly[i - lagWeeks]!
    if (Number.isFinite(change)) past.push(change)
  }
  return { effect, noise: past.slice(-FINDINGS.noiseWeeks), past, minSd }
}

/** The sign of an effect: 1, -1, or 0. */
export function signOf(effect: number): -1 | 0 | 1 {
  return Math.sign(effect) as -1 | 0 | 1
}

/** A finding the athlete has been shown (after deduplication, grouping and the caps), kept in a replay or a ledger to rank what repeats lower. */
export interface Shown {
  id: string
  sign: -1 | 0 | 1
  atMs: number
}

export type Continuation = 'new' | 'continued' | 'reversal'

const WEEK_MS = 7 * 86_400_000

/**
 * Whether a finding was shown in the previous 12 weeks, and which way: the same sign again is a
 * continuation, the opposite a reversal, and no sighting is new. Only the newest sighting counts.
 */
export function continuationOf(
  id: string,
  sign: number,
  asOfMs: number,
  shown: readonly Shown[],
): Continuation {
  const from = asOfMs - FINDINGS.continuationWeeks * WEEK_MS
  let latest: Shown | null = null
  for (const s of shown) {
    if (
      s.id === id &&
      s.atMs > from &&
      s.atMs < asOfMs &&
      (latest === null || s.atMs >= latest.atMs)
    ) {
      latest = s
    }
  }
  if (latest === null) return 'new'
  return latest.sign === sign ? 'continued' : 'reversal'
}

/** Surprise for ranking after continuation: damped to 0.4 when the finding is the same one again, lifted by 1.25 (to at most 1) on a reversal. The bar is not judged on it. */
export function adjustedSurprise(surprise: number, continuation: Continuation): number {
  if (continuation === 'continued') return surprise * FINDINGS.continuedFactor
  if (continuation === 'reversal') return Math.min(1, surprise * FINDINGS.reversalFactor)
  return surprise
}

/** The surprise of a candidate when it is judged to start being spoken, and when it is judged to go on being. */
export interface Surprises {
  entering: number
  staying: number
}

/** The two surprises of a candidate's history: the first needs the effect to be far from usual, the second does not. */
export function surprisesOf(input: SurpriseInput | null): Surprises {
  const { z, value } = surpriseReading(input)
  return { entering: z >= FINDINGS.minSurpriseZ ? value : 0, staying: value }
}

/**
 * What stops a finding clearing the speaking bar at one evaluation, or null when it clears. Confidence
 * must be 0.80. To start, surprise must be 0.40 and the effect far enough from usual (surpriseOf); once a
 * finding is being spoken (`holding`) it needs only the lower floor of the surprise formula itself, 0.25,
 * so one that is true and no longer new does not drop out, and one at the bar does not come and go. Both
 * are before any damping or lifting, which only rank.
 */
export function barRejection(
  confidence: number,
  surprise: Surprises,
  holding: boolean,
): 'confidence' | 'surprise' | null {
  if (!(confidence >= FINDINGS.minConfidence)) return 'confidence'
  const surprising = holding
    ? surprise.staying >= FINDINGS.stayFloor
    : surprise.entering >= FINDINGS.minSurprise
  return surprising ? null : 'surprise'
}

/**
 * Id, sign and the size of the effect in steps of 50% (a log scale): it changes when the finding has
 * moved about enough to show again, though a move across a step edge changes it by less. The decision
 * to show again is materiallyChanged's.
 */
export function fingerprintOf(id: string, effect: number): string {
  const step = Math.log(1 + FINDINGS.materialChange)
  const size = effect === 0 ? 'none' : Math.round(Math.log(Math.abs(effect)) / step)
  return `${id}|${signOf(effect)}|${size}`
}

/** Whether a finding's effect has moved enough from the one shown to show again: it changed sign, or moved by 50% of it or more. */
export function materiallyChanged(shownEffect: number, effect: number): boolean {
  if (signOf(shownEffect) !== signOf(effect)) return true
  return Math.abs(effect - shownEffect) >= FINDINGS.materialChange * Math.abs(shownEffect)
}
