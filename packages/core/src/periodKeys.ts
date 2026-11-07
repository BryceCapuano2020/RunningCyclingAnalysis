import type { ThresholdLine } from './threshold'
import { SPORTS } from './types'
import type { ActivityDigest, Sport } from './types'

/** The ids of a set among these digests, sorted and joined: what in a library's set-aside can move their analysis. */
export function setAsideAmong(digests: ActivityDigest[], setAside: readonly string[]): string {
  const named = new Set(setAside)
  return digests
    .filter((digest) => named.has(digest.id))
    .map((digest) => digest.id)
    .sort()
    .join(',')
}

/**
 * A sport's heart-rate line as a key for the analysis of `selected`: what the period reads of it, which is the line's slope,
 * spread and pooled offset and highest block, and the offset, highest block and exclusion of each of the period's own
 * activities. A line fitted again over the same activities (a change of mass and back) is the same key, and an activity added
 * outside the period that leaves these as they were does not redo the period.
 */
function lineKey(line: ThresholdLine, selected: readonly ActivityDigest[]): string {
  if ('refused' in line) return line.refused
  const rides = selected.flatMap(({ id }) => {
    const offset = line.offsets.get(id)
    const excluded = line.excluded.has(id)
    return offset === undefined && !excluded
      ? []
      : [[id, offset ?? null, line.rideHighest.get(id) ?? null, excluded]]
  })
  return JSON.stringify([line.slope, line.spread, line.offset, line.highest, rides])
}

/** The lines of every sport as one key (`lineKey`); 'own' where the period fits its own. */
export function linesKey(
  lines: Record<Sport, ThresholdLine> | undefined,
  selected: readonly ActivityDigest[],
): string {
  if (lines === undefined) return 'own'
  return SPORTS.map((sport) => lineKey(lines[sport], selected)).join('|')
}
