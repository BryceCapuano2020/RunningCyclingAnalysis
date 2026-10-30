import type { ReferenceSettings } from '../athlete/references'
import type { Sport } from '../types'
import { referenceMaxHeartRates } from './effort'
import type { MaxHeartRates } from './effort'

/*
 * Whether a heart-rate reference can certify an effort as hard. The reference is the athlete's own maximum, so on its
 * own it can only say how a best compares with the athlete's top, never whether that top was high. These are the checks
 * that stand in front of a share of it; docs/design/effort-gate.md has the bands and the calibration.
 */

/**
 * What a reference can certify. `trusted` can. `low` is under what a maximum is at the athlete's age. `habitual` is
 * where the athlete's typical day already sits. `high` is far above what a maximum is at the athlete's age (a strap or a
 * sensor lock reads so). `thin` rests on too few days with a heart rate to say.
 */
export type ReferenceReading = 'trusted' | 'low' | 'habitual' | 'high' | 'thin'

/** Where the reference came from: the activities, a maximum the athlete entered, or the age-predicted maximum. */
export type ReferenceSource = 'data' | 'entered' | 'age'

/** The reference heart rates efforts are judged against, with what each can certify and where each came from. */
export interface EffortReference {
  referenceHr: MaxHeartRates
  reading: Record<Sport, ReferenceReading | null>
  source: Record<Sport, ReferenceSource | null>
  /** For a reference from the activities, the sport whose days supplied it (cycling's may be run's less 6 bpm). */
  from: Record<Sport, Sport | null>
}

/** The reference of a library with no heart rate. */
export const NO_EFFORT_REFERENCE: EffortReference = {
  referenceHr: { run: null, ride: null },
  reading: { run: null, ride: null },
  source: { run: null, ride: null },
  from: { run: null, ride: null },
}

/**
 * The age-predicted maximum heart rate, bpm: 208 - 0.7 x age (Tanaka, Monahan and Seals 2001, J Am Coll Cardiol 37:153,
 * a meta-analysis of 18,712 people; the spread between people is about 10 bpm).
 */
export function predictedMaxHeartRate(ageYears: number): number {
  return Math.round(208 - 0.7 * ageYears)
}

/** The lowest reference, bpm, that can be a maximum when the age is not known: the mean maximum at 80 is 152. */
export const REFERENCE_FLOOR_BPM = 150

/** With the age known the floor is this far under the predicted maximum (three of the ~10 bpm spread), and never under the minimum. */
export const FLOOR_UNDER_PREDICTED_BPM = 30
export const FLOOR_MINIMUM_BPM = 130

/** A reference this far above the age-predicted maximum (two and a half of the spread) is more likely a strap or a lock than a maximum. */
export const HIGH_OVER_PREDICTED_BPM = 25

/** The floor under which a reference is low: by the age when it is known, else the one absolute number. */
export function referenceFloorBpm(ageYears: number | null): number {
  if (ageYears === null) return REFERENCE_FLOOR_BPM
  return Math.max(FLOOR_MINIMUM_BPM, predictedMaxHeartRate(ageYears) - FLOOR_UNDER_PREDICTED_BPM)
}

/**
 * The typical day's peak heart rate over the maximum, from which the maximum is where the athlete lives. A true maximum
 * is reached on few days, so a typical day sits under it. Between the typical-day ratio of hard libraries and of easy or
 * tempo-only ones in the synthetic harness; see effort/gate.sim.test.ts.
 */
export const HABITUAL_PEAK_RATIO = 0.9

/**
 * With the age known, a typical day at the maximum does not hold the reference when the reference is within this many bpm
 * of the age-predicted maximum: an athlete who trains hard most days has a typical day near a true maximum, and the age says
 * it is one. Without the age that cannot be told from a runner whose every day is a tempo, so the athlete is asked to enter
 * their maximum instead.
 */
export const HABITUAL_SLACK_BPM = 10

/** Fewest days with a heart rate for the typical day to say anything, and for a library to set its own reference. */
export const HABITUAL_MIN_DAYS = 12

/** The per-day peaks of one sport against its maximum, as `typicalDayOf` gives them. */
export interface TypicalDayShare {
  share: number
  days: number
}

const OTHER_SPORT: Record<Sport, Sport> = { run: 'ride', ride: 'run' }

export interface ReferenceInput {
  /** The reference the activities give (`referenceMaxHeartRates`), with each sport's own maximum behind it. */
  reference: MaxHeartRates
  observedMax: Record<Sport, number | null>
  typical: Record<Sport, TypicalDayShare | null>
  settings: ReferenceSettings
  /** The athlete's age at the newest heart rate, or null without a year of birth. */
  ageYears: number | null
  /** Sports whose bests the curve's shape judges as well: a ride with a power meter, where the typical day proves nothing. */
  shapeJudges: Record<Sport, boolean>
}

/**
 * Each sport's effort reference and what it can certify.
 * - A maximum the athlete entered wins, and is trusted: they said it.
 * - Under HABITUAL_MIN_DAYS with a heart rate the activities cannot set a reference: with the age known it is the
 *   age-predicted maximum, else the library is `thin` and nothing is judged.
 * - Otherwise it is the activities', read by the sport that supplied it: `low` under the floor, `high` over the age
 *   band, `habitual` when the typical day sits at it. A rider with a power meter is not held for `habitual`.
 */
export function readReferences(input: ReferenceInput): EffortReference {
  const { reference, observedMax, typical, settings, ageYears, shapeJudges } = input
  const entered = referenceMaxHeartRates(settings.entered.run, settings.entered.ride)
  const predicted = ageYears === null ? null : predictedMaxHeartRate(ageYears)
  const readOne = (sport: Sport): One | null => {
    const bpm = entered[sport]
    if (bpm !== null) return { bpm, reading: 'trusted', source: 'entered', from: null }
    const data = reference[sport]
    if (data === null) return null
    const supplier = observedMax[sport] === data ? sport : OTHER_SPORT[sport]
    const day = typical[supplier]
    if (day === null || day.days < HABITUAL_MIN_DAYS) {
      return predicted === null
        ? { bpm: data, reading: 'thin', source: 'data', from: supplier }
        : { bpm: predicted, reading: 'trusted', source: 'age', from: null }
    }
    const own = observedMax[supplier] ?? data
    let reading: ReferenceReading = 'trusted'
    if (own < referenceFloorBpm(ageYears)) reading = 'low'
    else if (predicted !== null && own > predicted + HIGH_OVER_PREDICTED_BPM) reading = 'high'
    else if (
      day.share >= HABITUAL_PEAK_RATIO &&
      !shapeJudges[sport] &&
      (predicted === null || own < predicted - HABITUAL_SLACK_BPM)
    ) {
      reading = 'habitual'
    }
    return { bpm: data, reading, source: 'data', from: supplier }
  }
  const found = { run: readOne('run'), ride: readOne('ride') }
  return {
    referenceHr: { run: found.run?.bpm ?? null, ride: found.ride?.bpm ?? null },
    reading: { run: found.run?.reading ?? null, ride: found.ride?.reading ?? null },
    source: { run: found.run?.source ?? null, ride: found.ride?.source ?? null },
    from: { run: found.run?.from ?? null, ride: found.ride?.from ?? null },
  }
}

interface One {
  bpm: number
  reading: ReferenceReading
  source: ReferenceSource
  from: Sport | null
}
