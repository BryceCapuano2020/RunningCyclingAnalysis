import type { BehaviourNoise, GpsNoise, HeartRateNoise, LevelNoise, NoiseModel } from './types'

/** Changes to a noise model, field by field. */
export interface NoisePatch {
  gps?: Partial<GpsNoise>
  heartRate?: Partial<HeartRateNoise>
  level?: Partial<LevelNoise>
  behaviour?: Partial<BehaviourNoise>
}

/** `base` with the patch laid over it; the base is not changed. */
export function noiseWith(base: NoiseModel, patch: NoisePatch): NoiseModel {
  return {
    sensor: {
      gps: { ...base.sensor.gps, ...patch.gps },
      heartRate: { ...base.sensor.heartRate, ...patch.heartRate },
    },
    level: { ...base.level, ...patch.level },
    behaviour: { ...base.behaviour, ...patch.behaviour },
  }
}
