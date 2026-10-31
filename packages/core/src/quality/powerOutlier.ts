/**
 * A lone power spike (revision 7): one second far above both its neighbours. A power meter reports an average over
 * about a second, so a rider's power does not jump hundreds of watts for a single second and fall back, but a
 * dropped packet, a bad crank-arm read or a clock slip does. Without a rule only a reading over `powerSpike.maxW`
 * (2,000 W) is caught, so a lone 1,500 W second adds 200 W to a 5 s best and 100 W to a 10 s one. The values are a
 * starting point fixed by powerOutlier.test.ts: a sprint rises over several seconds (the next second is as high),
 * so the rule cannot see it.
 */
export const POWER_OUTLIER = {
  /** The spike must stand this far, W, above the higher of its two neighbours. */
  minRiseW: 700,
  /** And be at least this many times that neighbour, so a hard effort's ordinary swing is not one. */
  minRatio: 2,
  /** The flag reaches this far beyond the second. */
  marginS: 1,
} as const

/** The seconds that are a lone spike: far above both finite neighbours. Edges have one neighbour and are never one. */
export function lonePowerSpikes(power: Float64Array): number[] {
  const t = POWER_OUTLIER
  const found: number[] = []
  for (let i = 1; i < power.length - 1; i++) {
    const here = power[i]!
    const before = power[i - 1]!
    const after = power[i + 1]!
    if (!Number.isFinite(here) || !Number.isFinite(before) || !Number.isFinite(after)) continue
    const neighbour = Math.max(before, after)
    if (here - neighbour >= t.minRiseW && here >= t.minRatio * neighbour) found.push(i)
  }
  return found
}
