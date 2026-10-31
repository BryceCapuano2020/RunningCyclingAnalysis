import type { Activity } from '../types'

/** What a device keeps of a generated session, for the sample: a stretch where the watch lost its signal and recorded nothing. */

/** A stretch the watch did not record: where it starts, as a share of the activity, and how long, s. */
export interface RecordGap {
  atShare: number
  lengthS: number
}

/**
 * The activity with a record gap, as the importer reads one: speed, heart rate, power and cadence unknown
 * inside it, the distance held there and stepping to the true figure when recording resumes, and the seconds
 * marked unrecorded so no best spans them.
 */
export function withRecordGap(a: Activity, gap: RecordGap): Activity {
  const start = Math.max(1, Math.floor(gap.atShare * a.n))
  const end = Math.min(a.n, start + gap.lengthS)
  const unrecorded = new Uint8Array(a.n)
  const speed = a.speed.slice()
  const distance = a.distance.slice()
  const heartRate = a.heartRate.slice()
  const power = a.power.slice()
  const cadence = a.cadence?.slice()
  for (let i = start; i < end; i++) {
    unrecorded[i] = 1
    speed[i] = Number.NaN
    distance[i] = a.distance[start - 1]!
    heartRate[i] = Number.NaN
    power[i] = Number.NaN
    if (cadence) cadence[i] = Number.NaN
  }
  return { ...a, speed, distance, heartRate, power, ...(cadence ? { cadence } : {}), unrecorded }
}
