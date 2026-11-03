import type { UnevenFit } from '../cp'
import type { EffortGate } from '../effort'
import type { Vo2maxEstimate } from '../predict/vo2max'
import type { ThresholdEstimate } from '../threshold'
import type {
  BikeModel,
  Comparison,
  CriticalPowerFit,
  CriticalPowerRefusal,
  Curve,
  EffortCheck,
  HrCrossCheck,
  Sport,
  VirtualPowerAccuracy,
} from '../types'
import type { BikeModelSource } from '../virtualPower'
import type { Equivalence } from './equivalents'
import type { ActivitySummary } from './summary'

/**
 * Analysis of a set of digests. Best values follow one rule. Measured values (runs, and rides
 * with a power meter) are fixed per activity, so adding an activity never lowers a measured best.
 * Values for rides without a power meter are priced with `bikeModel`, which is refitted from every
 * power-meter ride in the same set. Adding a power-meter ride can therefore move those values in
 * either direction. `bikeModelSource` says whether the fit or the default model was used.
 */
export interface AnalysisResult {
  activities: ActivitySummary[]
  /** Best gross metabolic power while running, W/kg, at the prior-mean economy. */
  runCurve: Curve
  /**
   * Best mechanical power while riding, W. See the note above on rides without a power meter. With dated
   * body masses each value is the watts of the best power-to-weight ride at that duration, so it comes
   * from the same ride as rideMetabolicCurve.
   */
  rideCurve: Curve
  /** rideCurve expressed as gross metabolic W/kg at the prior-mean efficiency. */
  rideMetabolicCurve: Curve
  /**
   * Best mechanical power while riding, W, from the rides with a power meter alone. Estimated watts are
   * left out, so each value is a measurement, as the duration profile needs.
   */
  rideMeasuredCurve: Curve
  /**
   * Each sport's critical-power fit of its best 3 to 20 min, in gross metabolic W/kg, with its refusal and uneven reading below.
   * It is no sport's threshold: `runThreshold` and `rideThreshold` are, and the zones and the evidence rule read them. The race
   * predictions do not read the fit (they read each run's distance bests), and nothing in core does.
   */
  runCp: CriticalPowerFit | null
  rideCp: CriticalPowerFit | null
  /**
   * The ride threshold from every ride's efforts in the set, with heart rate as a second estimate that can lift it
   * (docs/design/threshold.md), in the unit of rideCp: gross metabolic W/kg. Null only with no ride effort of 3 min or more.
   */
  rideThreshold: ThresholdEstimate | null
  /**
   * The run threshold, built as the ride's is and meaning the same thing, the pace held for an hour (docs/design/threshold.md):
   * every counted run's strongest effort scaled to an hour by a runner's duration table, averaged, and never under an hour the
   * athlete ran. In the unit of runCp, gross metabolic W/kg. Null only with no run effort of 8 min or more: a run's shorter
   * bests are strides, hills and GPS noise, which a run's table does not read.
   */
  runThreshold: ThresholdEstimate | null
  /** Why runCp is null, once there are efforts to fit: see CriticalPowerRefusal. */
  runCpRefusal: CriticalPowerRefusal | null
  rideCpRefusal: CriticalPowerRefusal | null
  /**
   * Whether each sport's best 20 minutes was a hard effort, by heart rate (the effort gate). It is a label beside the
   * threshold and the check behind the change test, not a veto: the fits above are the curve's, and the ride threshold
   * takes heart rate as a hint.
   */
  effortGate: Record<Sport, EffortGate>
  /** The threshold without the uneven bests, which set only a floor on it; null without one. See cp/uneven. */
  runCpUneven: UnevenFit | null
  rideCpUneven: UnevenFit | null
  /** This period's own heart-rate check. The comparison and the equivalents read the library's (`CombineOptions.calibration`). */
  hr: HrCrossCheck
  comparison: Comparison
  equivalents: Equivalence[]
  /** Highest sustained heart rate on file, bpm; null without heart-rate data. */
  maxHeartRate: number | null
  /** Heart rate that running efforts are judged against, bpm; null without heart-rate data. */
  runMaxHeartRate: number | null
  /** Heart rate that cycling efforts are judged against, bpm; null without heart-rate data. */
  rideMaxHeartRate: number | null
  /** Highest running heart rate on file, bpm; null without running heart-rate data. */
  runObservedMaxHeartRate: number | null
  /** Highest cycling heart rate on file, bpm; null without cycling heart-rate data. */
  rideObservedMaxHeartRate: number | null
  /**
   * Ids of the activities whose heart rate is set aside, sorted: a best effort of theirs held at or
   * above threshold shows heart rate a working sensor would not. Their heart rate is left out of the
   * heart-rate check, the effort checks and the reference heart rates.
   */
  heartRateSetAside: string[]
  /** VO2max from heart rate against pace on hard runs, for the race predictions; null without one. */
  runVo2max: Vo2maxEstimate | null
  /** Whether each compared best effort was close to all-out, one entry per comparison duration. */
  effort: EffortCheck[]
  bikeModel: BikeModel
  /** 'calibrated' when bikeModel was fitted to power-meter rides, else 'default'. */
  bikeModelSource: BikeModelSource
  /** Leave-one-ride-out accuracy of the virtual power meter; null with no power-meter rides. */
  virtualAccuracy: VirtualPowerAccuracy | null
}
