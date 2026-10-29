import type { RawRecord, Resampled } from '../fit/resample'

/** The seconds of movement a device can count before its first distance and still have that distance kept. */
const HEAD_START_S = 30

/**
 * The distance to drop from a first unit: its first distance, unless the athlete could have covered it
 * before that distance was first recorded. The time allowed is HEAD_START_S plus the time to the first
 * record that has a distance (a file that gives none for minutes has its first reading filled back over
 * them), at the fastest speed the file itself shows, which the sport's limit caps.
 */
export function unexplainedStart(
  segment: RawRecord[],
  resampled: Resampled,
  maxSpeed: number,
): number {
  const firstDistance = resampled.distance[0]
  if (firstDistance === undefined || !Number.isFinite(firstDistance)) return 0
  const withDistance = segment.find((r) => Number.isFinite(r.distance))
  const lead = withDistance === undefined ? 0 : (withDistance.tMs - segment[0]!.tMs) / 1000
  let fastest = 0
  for (const v of resampled.speed) if (v > fastest && v <= maxSpeed) fastest = v
  return firstDistance > (HEAD_START_S + lead) * fastest ? firstDistance : 0
}

/** Subtracts `origin` from every distance. Distances stay non-decreasing. */
export function subtractDistance(distance: Float64Array, origin: number): void {
  if (!Number.isFinite(origin) || origin === 0) return
  for (let i = 0; i < distance.length; i++) distance[i] = distance[i]! - origin
}
