import type { BehaviourNoise, GpsNoise, HeartRateNoise, LevelNoise, NoiseModel } from './types'

/**
 * Named noise levels, the one table every synthetic tier shares. `measured` is the real-data level:
 * a per-effort log sd that gives the split-half spread of bests the change-test review measured
 * (about 4.5% for a run at 20 min, about 12.5% for a ride at 5 min) and the run and wander spreads
 * of a real library's steady runs (3.8% a run, 2% wander at 0.9 a week). Ranges are synthetic.
 */

const WATCH_GPS: GpsNoise = {
  speedSd: 0.03,
  corrS: 20,
  stops: { max: 4, minS: 5, maxS: 45 },
  altitudeWalkM: 0.5,
  altitudeStepM: 0.5,
}

const PHONE_GPS: GpsNoise = {
  speedSd: 0.06,
  corrS: 25,
  stops: { max: 4, minS: 5, maxS: 45 },
  altitudeWalkM: 1.2,
  altitudeStepM: 1,
}

const WRIST_HR: HeartRateNoise = {
  lagS: 20,
  sdBpm: 2.5,
  driftPerHour: 0.04,
  lock: { share: 0.15, minS: 120, maxS: 480 },
  dropouts: { max: 2, minS: 3, maxS: 40 },
  spikesPerHour: 0,
}

const STRAP_HR: HeartRateNoise = {
  lagS: 0,
  sdBpm: 1.5,
  driftPerHour: 0.04,
  lock: { share: 0, minS: 0, maxS: 0 },
  dropouts: { max: 1, minS: 3, maxS: 20 },
  spikesPerHour: 1,
}

const MEASURED_LEVEL: LevelNoise = {
  runSd: 0.038,
  wanderSd: 0.02,
  wanderRho: 0.9,
  seasonAmp: 0,
  heatDrop: 0,
  strapStep: 0,
}

const MEASURED_BEHAVIOUR: BehaviourNoise = {
  // Fitted so that two halves of SPLIT_HALF_EFFORTS (6) hard efforts each, of equal capability,
  // differ by the measured median: the fit assumes 6 efforts a half (a 12-week period).
  effortSd: { run: 0.0765, ride: 0.212 },
  easyFraction: { run: { min: 0.78, max: 0.85 }, ride: { min: 0.55, max: 0.7 } },
  fade: 0.03,
  treadmillShare: 0,
  cadence: true,
  stepRate: 170,
}

export const NOISE_PRESET_NAMES = [
  'quiet',
  'measured',
  'nuisanceAll',
  'phoneGps',
  'strapStep',
] as const
export type NoisePresetName = (typeof NOISE_PRESET_NAMES)[number]

const MEASURED: NoiseModel = {
  sensor: { gps: WATCH_GPS, heartRate: WRIST_HR },
  level: MEASURED_LEVEL,
  behaviour: MEASURED_BEHAVIOUR,
}

export const NOISE_PRESETS: Record<NoisePresetName, NoiseModel> = {
  /** Today's generator as a model: 1% speed and 1 bpm (uniform) noise, 0.2 m altitude steps, no stops. */
  quiet: {
    sensor: {
      gps: {
        ...WATCH_GPS,
        speedSd: 0.006,
        stops: { max: 0, minS: 0, maxS: 0 },
        altitudeWalkM: 0,
        altitudeStepM: 0.2,
      },
      heartRate: {
        ...STRAP_HR,
        sdBpm: 0.6,
        driftPerHour: 0,
        dropouts: { max: 0, minS: 0, maxS: 0 },
        spikesPerHour: 0,
      },
    },
    level: { ...MEASURED_LEVEL, runSd: 0, wanderSd: 0 },
    behaviour: { ...MEASURED_BEHAVIOUR, effortSd: { run: 0.01, ride: 0.01 }, fade: 0 },
  },
  measured: MEASURED,
  /** The D2 nuisances together: wander 3% at 0.95, season 2%, strap step 3%, heat 3%, wrist lock, cadence-less GPX. */
  nuisanceAll: {
    sensor: {
      gps: WATCH_GPS,
      heartRate: { ...WRIST_HR, lock: { share: 0.3, minS: 120, maxS: 480 } },
    },
    level: {
      ...MEASURED_LEVEL,
      wanderSd: 0.03,
      wanderRho: 0.95,
      seasonAmp: 0.02,
      heatDrop: 0.03,
      strapStep: 0.03,
    },
    behaviour: { ...MEASURED_BEHAVIOUR, cadence: false },
  },
  /** A slow runner with a phone and a chest strap; GPX without cadence. */
  phoneGps: {
    sensor: { gps: PHONE_GPS, heartRate: STRAP_HR },
    level: MEASURED_LEVEL,
    behaviour: { ...MEASURED_BEHAVIOUR, cadence: false, stepRate: 158 },
  },
  /** The measured level with one new strap part-way: a 3% step. */
  strapStep: {
    sensor: MEASURED.sensor,
    level: { ...MEASURED_LEVEL, strapStep: 0.03 },
    behaviour: MEASURED_BEHAVIOUR,
  },
}
