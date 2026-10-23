import type { ActivityDigest } from '@rca/core/types'
import type { ImportOutcome } from './protocol'

export type ImportSummary = Pick<ImportOutcome, 'runs' | 'rides' | 'firstStartMs' | 'lastStartMs'>

/** The runs and rides an import added, and the span of their start times. */
export function summarizeAdded(added: readonly ActivityDigest[]): ImportSummary {
  let runs = 0
  let rides = 0
  let firstStartMs = Infinity
  let lastStartMs = -Infinity
  for (const digest of added) {
    if (digest.sport === 'run') runs++
    else rides++
    firstStartMs = Math.min(firstStartMs, digest.startMs)
    lastStartMs = Math.max(lastStartMs, digest.startMs)
  }
  return added.length === 0 ? { runs, rides } : { runs, rides, firstStartMs, lastStartMs }
}
