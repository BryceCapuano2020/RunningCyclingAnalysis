import type { Activity, Sport } from '../../types'

export interface Spec {
  id?: string
  sport?: Sport
  n: number
  startMs?: number
  /** Default 4 m/s. Distance is the running sum of speed. */
  speed?: Float64Array
  /** Altitude follows this gradient unless `altitude` is given. Default flat. */
  grade?: number
  altitude?: Float64Array
  /** Default 150 bpm. */
  heartRate?: Float64Array
  /** Given for a power meter. */
  power?: Float64Array
  indoor?: boolean
  noHeartRate?: boolean
  noAltitude?: boolean
  /** Auto-pause flags. Default none. */
  paused?: Uint8Array
}

/** A 1 Hz activity built from a spec. */
export function syntheticActivity(spec: Spec): Activity {
  const n = spec.n
  const speed = spec.speed ?? new Float64Array(n).fill(4)
  const distance = new Float64Array(n)
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + speed[i]!
  const grade = spec.grade ?? 0
  let altitude = spec.altitude ?? Float64Array.from(distance, (d) => 100 + grade * d)
  if (spec.noAltitude) altitude = new Float64Array(n).fill(NaN)
  return {
    id: spec.id ?? 'a',
    name: spec.id ?? 'a',
    sport: spec.sport ?? 'run',
    startMs: spec.startMs ?? 0,
    n,
    speed,
    distance,
    altitude,
    heartRate: spec.heartRate ?? new Float64Array(n).fill(150),
    power: spec.power ?? new Float64Array(n).fill(NaN),
    paused: spec.paused ?? new Uint8Array(n),
    hasPower: spec.power !== undefined,
    hasHeartRate: !spec.noHeartRate,
    hasAltitude: !spec.noAltitude,
    indoor: spec.indoor ?? false,
  }
}
