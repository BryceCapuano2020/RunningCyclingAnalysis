import { RESTING_W_PER_KG } from '../constants'
import type { HrPoint } from '../types'

export interface BlockOptions {
  blockS?: number
  skipS?: number
}

/**
 * Averages heart rate and metabolic power over non-overlapping blocks of steady-state samples.
 * A block is kept when at least 90% of its samples are usable, and dropped when its mean power
 * is too low to be exercise.
 */
export function blockPoints(
  metabolicPower: Float64Array,
  heartRate: Float64Array,
  valid: Uint8Array,
  validHeartRate: Uint8Array,
  activityId: string,
  opts: BlockOptions = {},
): HrPoint[] {
  const blockS = opts.blockS ?? 300
  const skipS = opts.skipS ?? 600
  if (blockS < 1) return []
  const n = Math.min(metabolicPower.length, heartRate.length, valid.length, validHeartRate.length)
  const points: HrPoint[] = []
  for (let start = skipS; start + blockS <= n; start += blockS) {
    let usable = 0
    let powerSum = 0
    let hrSum = 0
    for (let i = start; i < start + blockS; i++) {
      const p = metabolicPower[i]!
      const h = heartRate[i]!
      if (valid[i] === 1 && validHeartRate[i] === 1 && Number.isFinite(p) && Number.isFinite(h)) {
        usable++
        powerSum += p
        hrSum += h
      }
    }
    if (10 * usable < 9 * blockS) continue
    const meanPower = powerSum / usable
    if (meanPower < 2 * RESTING_W_PER_KG) continue
    points.push({ metabolicPower: meanPower, heartRate: hrSum / usable, activityId })
  }
  return points
}
