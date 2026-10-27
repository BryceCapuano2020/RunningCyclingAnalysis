import { sha256Hex } from '../../sha256'
import { sampleDataset } from '../../synthetic'
import type { Activity, ActivityDigest } from '../../types'
import { digestActivity } from '../digestActivity'

/**
 * JSON in which equal text means equal values. Plain JSON writes NaN and the infinities as null, -0
 * as 0, and leaves out a key set to undefined. Every string is tagged too, so no string can pass
 * for one of those.
 */
function exactJson(digest: ActivityDigest): string {
  return JSON.stringify(digest, (_key, value: unknown) => {
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return `string:${value}`
    if (typeof value !== 'number') return value
    if (Object.is(value, -0)) return 'number:-0'
    return Number.isFinite(value) ? value : `number:${value}`
  })
}

/**
 * A copy of a sample activity with a pause, a recording gap, missing altitude and an altitude
 * outside the air-density range, so the masks and the density fallback are exercised too.
 */
function withGaps(activity: Activity): Activity {
  const { n } = activity
  const paused = new Uint8Array(n)
  const unrecorded = new Uint8Array(n)
  const altitude = Float64Array.from(activity.altitude)
  const at = (fraction: number) => Math.floor(n * fraction)
  paused.fill(1, at(0.2), at(0.2) + 120)
  unrecorded.fill(1, at(0.5), at(0.5) + 60)
  altitude.fill(NaN, at(0.7), at(0.7) + 30)
  altitude[at(0.8)] = 20_000
  return { ...activity, id: `${activity.id}-gaps`, paused, unrecorded, altitude }
}

/** SHA-256 of the exact digest of every sample activity and of its copy with gaps, by activity id. */
export async function sampleDigestHashes(): Promise<Record<string, string>> {
  const activities = sampleDataset().activities.flatMap((activity) => [
    activity,
    withGaps(activity),
  ])
  const encoder = new TextEncoder()
  const hashes: Record<string, string> = {}
  for (const activity of activities) {
    hashes[activity.id] = await sha256Hex(encoder.encode(exactJson(digestActivity(activity))))
  }
  return hashes
}
