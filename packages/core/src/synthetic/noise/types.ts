import type { Sport } from '../../types'

/**
 * Sensor and behaviour noise for the synthetic generator. Every range is synthetic: it is what a
 * persona sets, not a figure read from any one athlete. A model is optional everywhere; absent,
 * the generator is byte-identical to the noise-free one.
 */

/** GPS speed and altitude as a phone or watch reports them. */
export interface GpsNoise {
  /** Relative sd of the speed error (AR(1)). Watch about 0.03, phone about 0.06. */
  speedSd: number
  /** Correlation time of the speed error, s. */
  corrS: number
  /** Stops mid-run (lights, gates): a random count from 0 to `max`, each `minS` to `maxS` s. */
  stops: { max: number; minS: number; maxS: number }
  /** Altitude random walk, metres per sqrt(minute). */
  altitudeWalkM: number
  /** Altitude quantisation step, m. 0 keeps the generator's own step. */
  altitudeStepM: number
}

/** A wrist or strap heart-rate sensor. */
export interface HeartRateNoise {
  /** Extra optical lag on top of the physiological lag, s. 0 for a strap. */
  lagS: number
  /** White reading noise, bpm. */
  sdBpm: number
  /** Cardiac drift: relative rise over an hour at steady effort. */
  driftPerHour: number
  /** Cadence lock: the chance a run has one stretch where the wrist reads the step rate. */
  lock: { share: number; minS: number; maxS: number }
  /** Dropouts: a random count from 0 to `max`, each `minS` to `maxS` s of missing readings. */
  dropouts: { max: number; minS: number; maxS: number }
  /** Single-sample strap spikes per hour. */
  spikesPerHour: number
}

export interface SensorNoise {
  gps: GpsNoise
  heartRate: HeartRateNoise
}

/** The athlete's level over weeks, in log units. Shares its draw order with fitness/test/runSim.ts. */
export interface LevelNoise {
  /** Spread of one run (Student t, 5 degrees of freedom). */
  runSd: number
  wanderSd: number
  /** Weekly correlation of the wander. */
  wanderRho: number
  /** Amplitude of the annual sine. */
  seasonAmp: number
  /** Log drop in heat weeks. 0 for none. */
  heatDrop: number
  /** Size of a one-off step (a new strap), random sign, in the middle 40% of the weeks. 0 for none. */
  strapStep: number
}

/** What the athlete does, per sport where the sport matters. */
export interface BehaviourNoise {
  /** Per-effort log sd of a hard effort's reading; calibrated to the real split-half spread. */
  effortSd: Record<Sport, number>
  /** Easy effort as a fraction of critical effort above rest (run: of critical speed). */
  easyFraction: Record<Sport, { min: number; max: number }>
  /** Largest fade over an activity's hard samples, as a fraction. */
  fade: number
  /** Share of runs on a treadmill. */
  treadmillShare: number
  /** Whether the files carry a cadence stream. False for a GPX without extensions. */
  cadence: boolean
  /** Run step rate, steps per minute. */
  stepRate: number
}

export interface NoiseModel {
  sensor: SensorNoise
  level: LevelNoise
  behaviour: BehaviourNoise
}
