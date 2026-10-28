import type { Sport } from '../types'

/**
 * Whose heart rate is set aside, judged over a whole library, with what it was judged against. A period's
 * analysis lists only its own activities, and its reference heart rates are its own, so what the athlete
 * sees for a period can differ from what the library was judged by; this is the library's.
 */
export interface HeartRateJudgement {
  /** Ids of the activities whose heart rate is set aside, sorted. */
  setAside: readonly string[]
  /** The reference heart rate each sport's efforts were judged against, bpm: the library's, not a period's. Null without one. */
  referenceHr: Record<Sport, number | null>
  /** Each sport's threshold the efforts were judged against, in the unit of its fit (gross metabolic W/kg). Null without one. */
  threshold: Record<Sport, number | null>
}

/** Nothing judged: no library, or none with a heart rate. */
export const NO_HEART_RATE_JUDGEMENT: HeartRateJudgement = {
  setAside: [],
  referenceHr: { run: null, ride: null },
  threshold: { run: null, ride: null },
}
