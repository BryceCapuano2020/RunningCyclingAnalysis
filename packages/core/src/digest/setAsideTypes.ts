import type { CriticalPowerFit, HrCalibration, Sport } from '../types'

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
  /** Each sport's own highest sustained heart rate in the kept activities, bpm: the library's. Null without one. */
  observedMaxHr: Record<Sport, number | null>
  /**
   * Each sport's threshold fit over the whole library, as an analysis of it would report it: null when there are too
   * few efforts or the fit is refused. The zones' threshold references are these, so they are the library's.
   */
  fit: Record<Sport, CriticalPowerFit | null>
  /** Each sport's threshold the efforts were judged against, in the unit of its fit (gross metabolic W/kg). Null without one. */
  threshold: Record<Sport, number | null>
  /**
   * The heart-rate calibration of the run-versus-ride efficiency over the whole library, which every period's
   * equivalents and comparison read, so one ride is worth the same run pace under any period. Null without
   * enough heart rate in both sports.
   */
  calibration: HrCalibration | null
}

/** Nothing judged: no library, or none with a heart rate. */
export const NO_HEART_RATE_JUDGEMENT: HeartRateJudgement = {
  setAside: [],
  referenceHr: { run: null, ride: null },
  observedMaxHr: { run: null, ride: null },
  threshold: { run: null, ride: null },
  fit: { run: null, ride: null },
  calibration: null,
}
