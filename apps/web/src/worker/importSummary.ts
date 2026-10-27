import type { ActivityDigest, Sport } from '@rca/core/types'
import type { ImportOutcome } from './protocol'

export type ImportSummary = Pick<ImportOutcome, 'runs' | 'rides' | 'firstStartMs' | 'lastStartMs'>

/** The runs and rides an import added, and the span of their start times. */
export function summarizeAdded(added: readonly ActivityDigest[]): ImportSummary {
  const counts: Record<Sport, number> = { run: 0, ride: 0 }
  let firstStartMs = Infinity
  let lastStartMs = -Infinity
  for (const digest of added) {
    counts[digest.sport]++
    firstStartMs = Math.min(firstStartMs, digest.startMs)
    lastStartMs = Math.max(lastStartMs, digest.startMs)
  }
  const { run: runs, ride: rides } = counts
  return added.length === 0 ? { runs, rides } : { runs, rides, firstStartMs, lastStartMs }
}
