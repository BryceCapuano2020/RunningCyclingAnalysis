import { DRIVETRAIN_EFFICIENCY, G, RESTING_W_PER_KG } from '../constants'
import { mulberry32 } from '../math'
import { runCost } from '../metabolic'
import { airDensity } from '../physics/air'
import type { Activity, Sport } from '../types'
import type { SyntheticAthlete } from './athlete'
import type { ActivitySpec } from './spec'
import type { GradeFn } from './target'
import { behaviourTarget, roughGrade } from './noise/behaviour'
import { applySensorNoise } from './noise/sensor'
import type { NoiseModel } from './noise/types'
import { applyLag, gradeFunction, holdWindows, rawTarget } from './target'

const MAX_RUN_SPEED_MS = 7.5
const MIN_RIDE_SPEED_MS = 1
const MAX_RIDE_SPEED_MS = 25
const RIDE_START_SPEED_MS = 5
const COAST_ABOVE_MS = 18
const START_ALTITUDE_M = 200
const ALTITUDE_RESOLUTION_M = 0.2
const SPEED_NOISE = 0.01
const POWER_NOISE = 0.03
const HR_LAG_S = 30
const HR_NOISE_BPM = 1
const GLITCH_START_FRACTION = 0.4
const GLITCH_LENGTH_S = 360
const GLITCH_MIN_BPM = 100
const GLITCH_RANGE_BPM = 6

interface Motion {
  /** True speed, m/s. */
  speed: Float64Array
  /** True horizontal distance, m. */
  distance: Float64Array
  /** True altitude, m. */
  altitude: Float64Array
  /** True mechanical power, W. NaN for runs. */
  power: Float64Array
  /** Gross metabolic power actually produced, W/kg. Drives heart rate. */
  metabolic: Float64Array
}

function uniform(rand: () => number, halfWidth: number): number {
  return (2 * rand() - 1) * halfWidth
}

function runSpeed(metabolicWPerKg: number, grade: number, economyScale: number): number {
  const v = (metabolicWPerKg - RESTING_W_PER_KG) / (economyScale * runCost(grade))
  return Math.min(MAX_RUN_SPEED_MS, Math.max(0, v))
}

/** Speed derivative under a steady mechanical power, W, at grade rise/run and air density kg/m^3. */
function rideAcceleration(
  v: number,
  grade: number,
  powerW: number,
  athlete: SyntheticAthlete,
  airDensityKgM3: number,
): number {
  const mass = athlete.massKg + athlete.bikeMassKg
  const theta = Math.atan(grade)
  const traction = (powerW * DRIVETRAIN_EFFICIENCY) / Math.max(v, 1)
  const gravityAndRolling = mass * G * (Math.sin(theta) + athlete.crr * Math.cos(theta))
  const drag = 0.5 * airDensityKgM3 * athlete.cda * v * v
  return (traction - gravityAndRolling - drag) / mass
}

function simulate(
  athlete: SyntheticAthlete,
  sport: Sport,
  target: Float64Array,
  gradeAt: GradeFn,
): Motion {
  const n = target.length
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const power = new Float64Array(n).fill(NaN)
  const metabolic = new Float64Array(n)
  if (n === 0) return { speed, distance, altitude, power, metabolic }

  altitude[0] = START_ALTITUDE_M
  if (sport === 'ride') speed[0] = RIDE_START_SPEED_MS

  for (let i = 0; i < n; i++) {
    const m = target[i]!
    const grade = gradeAt(distance[i]!, i)
    let v: number
    if (sport === 'run') {
      v = runSpeed(m, grade, athlete.runEconomyScale)
      speed[i] = v
      metabolic[i] = RESTING_W_PER_KG + athlete.runEconomyScale * runCost(grade) * v
    } else {
      v = speed[i]!
      const demand = m * athlete.grossEfficiency * athlete.massKg
      const rho = airDensity(altitude[i]!)
      let dv = rideAcceleration(v, grade, demand, athlete, rho)
      let p = demand
      if (grade < 0 && v + dv > COAST_ABOVE_MS) {
        p = 0
        dv = rideAcceleration(v, grade, 0, athlete, rho)
      }
      power[i] = p
      metabolic[i] = Math.max(RESTING_W_PER_KG, p / (athlete.grossEfficiency * athlete.massKg))
      if (i + 1 < n) speed[i + 1] = Math.min(MAX_RIDE_SPEED_MS, Math.max(MIN_RIDE_SPEED_MS, v + dv))
    }
    if (i + 1 < n) {
      distance[i + 1] = distance[i]! + v
      altitude[i + 1] = altitude[i]! + grade * v
    }
  }
  return { speed, distance, altitude, power, metabolic }
}

/**
 * Generates one activity, second by second, from the athlete's ground-truth parameters. With a
 * `noise` model the athlete behaves and the sensors read as the model says; without one the output
 * is exactly the noise-free generator's.
 */
export function generateActivity(
  athlete: SyntheticAthlete,
  spec: ActivitySpec,
  seed: number,
  noise?: NoiseModel,
): Activity {
  const rand = mulberry32(seed)
  const n = Math.max(0, Math.floor(spec.durationS))
  const isRide = spec.sport === 'ride'
  const cp = isRide ? athlete.cpRide : athlete.cpRun
  const raw = noise
    ? behaviourTarget(spec.effort, spec.sport, cp, athlete.wPrime, n, rand, noise.behaviour)
    : rawTarget(spec.effort, cp, athlete.wPrime, n, rand)
  const target = applyLag(raw, holdWindows(spec.effort, n))
  const rough = noise !== undefined && spec.terrain === 'rolling'
  const gradeAt = rough ? roughGrade(rand) : gradeFunction(spec.terrain, n, rand)
  const motion = simulate(athlete, spec.sport, target, gradeAt)

  const hasPower = isRide && (spec.withPower ?? true)
  const hasHeartRate = spec.withHeartRate ?? true
  const glitchStart = Math.floor(GLITCH_START_FRACTION * n)
  const glitchEnd = glitchStart + GLITCH_LENGTH_S
  const hrAlpha = 1 - Math.exp(-1 / HR_LAG_S)

  const speed = new Float64Array(n)
  const altitude = new Float64Array(n)
  const power = new Float64Array(n).fill(NaN)
  const heartRate = new Float64Array(n).fill(NaN)
  const hrTarget = (metabolic: number) =>
    Math.min(athlete.hrMax, athlete.hrIntercept + athlete.hrSlope * metabolic)
  let hr = hrTarget(motion.metabolic[0] ?? 0)

  for (let i = 0; i < n; i++) {
    speed[i] = motion.speed[i]! * (1 + uniform(rand, SPEED_NOISE))
    altitude[i] = Math.round(motion.altitude[i]! / ALTITUDE_RESOLUTION_M) * ALTITUDE_RESOLUTION_M
    if (hasPower) {
      power[i] = Math.round(motion.power[i]! * (1 + uniform(rand, POWER_NOISE)))
    }
    if (hasHeartRate) {
      hr += hrAlpha * (hrTarget(motion.metabolic[i]!) - hr)
      let reading = Math.round(hr + uniform(rand, HR_NOISE_BPM))
      if (spec.hrGlitch && i >= glitchStart && i < glitchEnd) {
        reading = GLITCH_MIN_BPM + Math.floor(rand() * GLITCH_RANGE_BPM)
      }
      heartRate[i] = reading
    }
  }

  const activity: Activity = {
    id: spec.id,
    name: spec.name,
    sport: spec.sport,
    startMs: spec.startMs,
    n,
    speed,
    distance: motion.distance,
    altitude,
    heartRate,
    power,
    paused: new Uint8Array(n),
    hasPower,
    hasHeartRate,
    hasAltitude: true,
    indoor: false,
  }
  return noise ? applySensorNoise(activity, noise, seed) : activity
}
