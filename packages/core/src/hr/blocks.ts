export interface BlockOptions {
  blockS?: number
  skipS?: number
}

export interface BlockAverage {
  /** Mean heart rate over the block's usable samples, bpm. */
  heartRate: number
  /** Mean of each column over the same samples, in the order the columns were given. */
  means: number[]
}

/**
 * Averages heart rate and each column over non-overlapping blocks of steady-state samples. A
 * sample is usable when it is valid, its heart rate is usable and every column is finite there.
 * A block is kept when at least 90% of its samples are usable.
 */
export function averageBlocks(
  columns: readonly Float64Array[],
  heartRate: Float64Array,
  valid: Uint8Array,
  validHeartRate: Uint8Array,
  opts: BlockOptions = {},
): BlockAverage[] {
  const blockS = opts.blockS ?? 300
  const skipS = opts.skipS ?? 600
  if (blockS < 1) return []
  const n = Math.min(
    heartRate.length,
    valid.length,
    validHeartRate.length,
    ...columns.map((c) => c.length),
  )
  const blocks: BlockAverage[] = []
  for (let start = skipS; start + blockS <= n; start += blockS) {
    const sums = columns.map(() => 0)
    let usable = 0
    let hrSum = 0
    for (let i = start; i < start + blockS; i++) {
      const h = heartRate[i]!
      if (valid[i] !== 1 || validHeartRate[i] !== 1 || !Number.isFinite(h)) continue
      if (!columns.every((c) => Number.isFinite(c[i]!))) continue
      usable++
      hrSum += h
      columns.forEach((c, k) => {
        sums[k] = sums[k]! + c[i]!
      })
    }
    if (10 * usable < 9 * blockS) continue
    blocks.push({ heartRate: hrSum / usable, means: sums.map((s) => s / usable) })
  }
  return blocks
}
