import type { ActivityLap } from '../workbench/types'
import type { PipelineUnit } from './pipeline'

/**
 * A segment's laps as half-open second ranges on its grid. A lap that ends at or after the last
 * sample's time ends there with that sample's second inside it, as a device's final lap does.
 */
export function lapsForSegment(
  laps: NonNullable<PipelineUnit['laps']>,
  startMs: number,
  n: number,
): ActivityLap[] {
  const endMs = startMs + n * 1000
  const lastSampleMs = endMs - 1000
  const out: ActivityLap[] = []
  let previousEnd = 0
  for (const lap of laps) {
    const from = Math.max(startMs, lap.startMs)
    const to = Math.min(endMs, lap.endMs >= lastSampleMs ? endMs : lap.endMs)
    if (!(to > from)) continue
    const startS = Math.max(previousEnd, Math.max(0, Math.round((from - startMs) / 1000)))
    const endS = Math.max(0, Math.min(n, Math.round((to - startMs) / 1000)))
    if (endS <= startS) continue
    out.push({ startS, endS, ...(lap.label === undefined ? {} : { label: lap.label }) })
    previousEnd = endS
  }
  return out
}
