import type { Activity } from '../types'

/** 1 for every second the device recorded. Activities without an unrecorded mask are all recorded. */
export function recordedSeconds(activity: Pick<Activity, 'n' | 'unrecorded'>): Uint8Array {
  if (activity.unrecorded === undefined) return new Uint8Array(activity.n).fill(1)
  return Uint8Array.from(activity.unrecorded, (u) => (u === 1 ? 0 : 1))
}

export function and(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i]! & b[i]!
  return out
}

/**
 * 1 for every second the device was recording: neither paused nor in a record gap it did not time.
 * Moving time and the averages over it are counted over these seconds only.
 */
export function movingMask(
  activity: Pick<Activity, 'n' | 'paused' | 'unrecorded'>,
): Uint8Array {
  const recorded = recordedSeconds(activity)
  return Uint8Array.from(activity.paused, (p, i) => (p === 1 ? 0 : recorded[i]!))
}

/** How many samples a 0/1 mask keeps. */
export function countKept(mask: Uint8Array): number {
  return mask.reduce((sum, m) => sum + m, 0)
}

/** The mean of the finite values that the mask keeps, or null when it keeps none. */
export function meanWhere(values: Float64Array, keep: Uint8Array): number | null {
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (keep[i] === 1 && Number.isFinite(value)) {
      sum += value
      count++
    }
  }
  return count === 0 ? null : sum / count
}
