import { EQUIVALENCE_MIN_S } from '../constants'
import type { Sport } from '../types'

/** The shortest and longest durations, s, a duration profile reads: 5 s up to 60 min. */
export const PROFILE_MIN_S = 5
export const PROFILE_MAX_S = 3600

/**
 * The shortest duration, s, each sport's best-effort curve and its stand-out profile read. A run's flat
 * pace over less than 3 minutes mostly measures the slope reading, so a run starts at 3 minutes (the
 * shortest equivalence); a ride reads from PROFILE_MIN_S. The charts show nothing shorter than 1 minute.
 */
export const CURVE_START_S: Record<Sport, number> = {
  run: EQUIVALENCE_MIN_S,
  ride: PROFILE_MIN_S,
}

/** Fewest durations with a value that a profile needs. */
export const PROFILE_MIN_DURATIONS = 5
/** Fewest sessions the bests must come from, so that one session cannot be the whole curve. */
export const PROFILE_MIN_SESSIONS = 2
/**
 * A profile needs a best at or under this, s: 1 min, to pin the short end of the curve. A curve that
 * starts later needs its first duration instead: see shortEndOf.
 */
export const PROFILE_SHORT_S = 60

/** The duration, s, a best must be at or under to pin the short end of a curve that starts at startS. */
export function shortEndOf(startS: number): number {
  return Math.max(PROFILE_SHORT_S, startS)
}
/** A profile needs a best at or over this, s: 12 min, to pin the long end of the curve. */
export const PROFILE_LONG_S = 720
/**
 * The short end is anchored by a best at or under this, s. Without one, Morton's maximal power is not
 * inferred, and only the durations from PROFILE_FLOOR_S up are shown.
 */
export const PROFILE_ANCHOR_S = 15
/** The shortest duration shown when the short end is not anchored: 2 min. */
export const PROFILE_FLOOR_S = 120

/**
 * A best is a lower bound, so after a first fit the points more than this far below it are dropped
 * and the curve is fitted once more: 10%.
 */
export const PROFILE_DROP_FRACTION = 0.1
/** Measurement error of a power meter, as a fraction (Maier 2017, via Leo 2022): 3%. A fit's spread is never below it. */
export const PROFILE_MEASUREMENT_ERROR = 0.03
/**
 * The chance that a profile of pure noise says some duration stands out: 10%. Each of its n rows is
 * judged at this over n, so the profile as a whole is judged at it.
 */
export const PROFILE_ALPHA = 0.05
/**
 * The fewest activities of the sport that a profile needs before it says the bests are in line with each other. With
 * fewer, a curve through a handful of efforts can match them by chance and each duration's best rests on a few
 * efforts, so agreement is no finding; the sentence says how many are needed instead.
 */
export const PROFILE_IN_LINE_MIN_ACTIVITIES = 40
/** The most durations the sentence names, the ones that stand out most. */
export const PROFILE_MAX_NAMED = 3
/**
 * A duration is named in the sentence only when the near end of its interval is at least this far from
 * zero, as a fraction: 2%. A duration whose interval only just clears zero is on the chart, and the
 * sentence leaves it out.
 */
export const PROFILE_NAMED_MARGIN = 0.02
