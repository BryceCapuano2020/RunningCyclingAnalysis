import type { EffortGate, EffortReference } from '../effort'
import type { CriticalPowerFit, HrCalibration, Sport } from '../types'
import type { EstimatedRideGate } from './estimatedRide'
import type { ReferenceMax } from './referenceMax'
import { NO_EFFORT_REFERENCE } from '../effort'
import { NO_THRESHOLD_FLOORS, NO_THRESHOLD_TIMELINE } from './thresholdTimelineTypes'
import type { ThresholdFloors, ThresholdTimeline } from './thresholdTimelineTypes'

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
  /**
   * Each sport's own maximum heart rate in the kept activities, bpm: the library's. It is the highest value reached on
   * several separate days (see `referenceMaxOf`), not the single highest reading. Null without one.
   */
  observedMaxHr: Record<Sport, number | null>
  /** What each sport's maximum rests on: the days that reached it and the date it counts from. Null without one. */
  observedMaxSource: Record<Sport, ReferenceMax | null>
  /**
   * The references efforts are judged against and what each can certify (`EffortReference`): the maximum the athlete entered,
   * else the age-predicted one for a library of too few days, else the activities'. The library's, so every period reads the same.
   */
  effortReference: EffortReference
  /**
   * Each sport's threshold fit over the whole library, as an analysis of it would report it: null when there are too
   * few efforts or the fit is refused. The zones' threshold references are these, so they are the library's.
   */
  fit: Record<Sport, CriticalPowerFit | null>
  /**
   * Each sport's threshold over time: for every week, the fit over the efforts of the half year that ends with it, which the
   * estimated pace and power zones of an activity are cut from (see `ThresholdStep`).
   */
  thresholdTimeline: ThresholdTimeline
  /**
   * Each sport's floor on its threshold over the whole library: the best 30 minutes on file, else the best 20, and the day
   * it was set. The zones are cut from it on a date no fit stands for. Null where the library holds neither.
   */
  floor: ThresholdFloors
  /**
   * The activities of each sport that reached a hard heart rate (`hard`), and the long ones whose average heart rate was
   * high (`endurance`), judged against the library's reference: what a race prediction may carry a time from, whichever
   * window the runs are taken from. Empty for a sport whose reference cannot certify one.
   */
  sessions: Record<Sport, EffortGate['sessions']>
  /** Each sport's threshold the efforts were judged against, in the unit of its fit (gross metabolic W/kg). Null without one. */
  threshold: Record<Sport, number | null>
  /**
   * The heart-rate calibration of the run-versus-ride efficiency over the whole library, which every period's
   * equivalents and comparison read, so one ride is worth the same run pace under any period. Null without
   * enough heart rate in both sports.
   */
  calibration: HrCalibration | null
  /**
   * What the library's measured rides show of heart rate against watts, which decides whether a ride without a
   * power meter counts toward a best (see ESTIMATED_RIDE). Every period, trend and record reads it, so they agree.
   * Null with too few measured rides with heart rate, when every estimated point counts as before.
   */
  rideGate: EstimatedRideGate | null
}

/** Nothing judged: no library, or none with a heart rate. */
export const NO_HEART_RATE_JUDGEMENT: HeartRateJudgement = {
  setAside: [],
  referenceHr: { run: null, ride: null },
  observedMaxHr: { run: null, ride: null },
  observedMaxSource: { run: null, ride: null },
  effortReference: NO_EFFORT_REFERENCE,
  threshold: { run: null, ride: null },
  fit: { run: null, ride: null },
  thresholdTimeline: NO_THRESHOLD_TIMELINE,
  floor: NO_THRESHOLD_FLOORS,
  sessions: { run: { hard: [], endurance: [] }, ride: { hard: [], endurance: [] } },
  calibration: null,
  rideGate: null,
}
