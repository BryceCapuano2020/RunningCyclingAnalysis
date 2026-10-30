import { normal, mulberry32 } from '../../math'
import type { Activity } from '../../types'
import { ar1, between, countUpTo } from './random'
import type { BehaviourNoise, GpsNoise, HeartRateNoise, NoiseModel } from './types'

const SEED_MIX = 0x5bd1e995
const STOP_MARGIN_S = 60
const SPIKE_BPM = { min: 40, max: 80 }
const LOCK_JITTER_BPM = 2
const DRIFT_HOUR_S = 3600
const BELT_STEP_KMH = 0.1
const CADENCE_SD = 3
const CADENCE_CORR_S = 30

/** Seconds flagged in `n` samples by up to `max` stretches of `minS` to `maxS` s inside the margins. */
function stretches(
  n: number,
  rand: () => number,
  spec: { max: number; minS: number; maxS: number },
): Uint8Array {
  const flags = new Uint8Array(n)
  if (n <= 2 * STOP_MARGIN_S) return flags
  for (let k = countUpTo(rand, spec.max); k > 0; k--) {
    const start = Math.floor(between(rand, STOP_MARGIN_S, n - STOP_MARGIN_S))
    const length = Math.round(between(rand, spec.minS, spec.maxS))
    flags.fill(1, start, Math.min(n, start + length))
  }
  return flags
}

function integrateDistance(a: Activity): void {
  let d = 0
  for (let i = 0; i < a.n; i++) {
    a.distance[i] = d
    d += a.speed[i]!
  }
}

function applyGps(a: Activity, gps: GpsNoise, rand: () => number): void {
  const error = ar1(a.n, rand, gps.speedSd, gps.corrS)
  const stopped = stretches(a.n, rand, gps.stops)
  for (let i = 0; i < a.n; i++) {
    a.speed[i] = stopped[i] ? 0 : Math.max(0, a.speed[i]! * (1 + error[i]!))
    if (stopped[i] && a.hasPower) a.power[i] = 0
  }
  integrateDistance(a)
  const walk = gps.altitudeWalkM / Math.sqrt(60)
  let drift = 0
  for (let i = 0; i < a.n; i++) {
    drift += walk * normal(rand)
    const raw = a.altitude[i]! + drift
    a.altitude[i] = gps.altitudeStepM
      ? Math.round(raw / gps.altitudeStepM) * gps.altitudeStepM
      : raw
  }
}

/** A treadmill reports belt speed in steps of 0.1 km/h and no altitude. */
function applyBelt(a: Activity): void {
  for (let i = 0; i < a.n; i++) {
    a.speed[i] = (Math.round((a.speed[i]! * 3.6) / BELT_STEP_KMH) * BELT_STEP_KMH) / 3.6
  }
  integrateDistance(a)
  a.altitude.fill(0)
  a.hasAltitude = false
}

function applyHeartRate(
  a: Activity,
  hr: HeartRateNoise,
  stepRate: number,
  rand: () => number,
): void {
  const alpha = hr.lagS > 0 ? 1 - Math.exp(-1 / hr.lagS) : 1
  let x = a.heartRate[0]!
  for (let i = 0; i < a.n; i++) {
    x += alpha * (a.heartRate[i]! - x)
    const drift = 1 + (hr.driftPerHour * i) / DRIFT_HOUR_S
    a.heartRate[i] = x * drift + hr.sdBpm * normal(rand)
  }
  if (a.sport === 'run' && rand() < hr.lock.share) {
    const length = Math.round(between(rand, hr.lock.minS, hr.lock.maxS))
    const start = Math.floor(between(rand, 0, Math.max(1, a.n - length)))
    for (let i = start; i < Math.min(a.n, start + length); i++) {
      a.heartRate[i] = stepRate + between(rand, -LOCK_JITTER_BPM, LOCK_JITTER_BPM)
    }
  }
  const spikeChance = hr.spikesPerHour / DRIFT_HOUR_S
  for (let i = 0; i < a.n; i++) {
    if (rand() < spikeChance) a.heartRate[i]! += between(rand, SPIKE_BPM.min, SPIKE_BPM.max)
  }
  const missing = stretches(a.n, rand, hr.dropouts)
  for (let i = 0; i < a.n; i++) {
    a.heartRate[i] = missing[i] ? Number.NaN : Math.round(a.heartRate[i]!)
  }
}

function addCadence(a: Activity, b: BehaviourNoise, rand: () => number): void {
  const wobble = ar1(a.n, rand, CADENCE_SD, CADENCE_CORR_S)
  a.cadence = new Float32Array(a.n)
  for (let i = 0; i < a.n; i++) {
    a.cadence[i] = a.speed[i]! > 0 ? Math.round(b.stepRate + wobble[i]!) : 0
  }
  a.cadenceUnit = 'steps/min'
}

/**
 * Turns a clean generated activity into what a device would have recorded. Mutates and returns
 * `a`. Draws from its own stream so the clean generator's draws are untouched.
 */
export function applySensorNoise(a: Activity, noise: NoiseModel, seed: number): Activity {
  const rand = mulberry32((seed ^ SEED_MIX) >>> 0)
  a.indoor = a.sport === 'run' && rand() < noise.behaviour.treadmillShare
  if (a.indoor) applyBelt(a)
  else applyGps(a, noise.sensor.gps, rand)
  if (a.hasHeartRate) applyHeartRate(a, noise.sensor.heartRate, noise.behaviour.stepRate, rand)
  if (a.sport === 'run' && noise.behaviour.cadence) addCadence(a, noise.behaviour, rand)
  return a
}
