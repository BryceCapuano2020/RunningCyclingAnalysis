import { HR_LOW_FOR_POWER } from '../constants'
import { quantile } from '../math'
import type { ActivityDigest, Sport } from '../types'
import { MEASURED_EFFORT } from './setAside'

/** One activity's level: its median heart rate and its median output over the 5 min blocks, in its sport's unit. */
interface Level {
  id: string
  output: number
  heartRate: number
}

// A digest is never changed once it is held, and its level reads no mass, so it is worked out once.
const levelCache = new WeakMap<ActivityDigest, Level | null>()

/**
 * An activity's level, or null when it is not judged: no heart rate, effort figures that are not measured, under
 * minMovingS of moving time, or too few blocks with both a heart rate and an output.
 */
function levelOf(digest: ActivityDigest): Level | null {
  let level = levelCache.get(digest)
  if (level === undefined) {
    level = levelFrom(digest)
    levelCache.set(digest, level)
  }
  return level
}

function levelFrom(digest: ActivityDigest): Level | null {
  const t = HR_LOW_FOR_POWER
  if (!digest.hasHeartRate || !MEASURED_EFFORT[digest.sport](digest)) return null
  if ((digest.movingS ?? digest.durationS) < t.minMovingS) return null
  const blocks = digest.hrBlocks.filter(
    (block) => block.value > 0 && Number.isFinite(block.value) && block.heartRate > 0,
  )
  if (blocks.length < t.minBlocks) return null
  return {
    id: digest.id,
    output: quantile(
      blocks.map((block) => block.value),
      0.5,
    ),
    heartRate: quantile(
      blocks.map((block) => block.heartRate),
      0.5,
    ),
  }
}

/** A line heart rate = intercept + slope * output, by the median of the pairwise slopes (Theil-Sen). */
interface Line {
  intercept: number
  slope: number
}

/** The robust line through the levels, or null when its slope is not positive: a heart rate that does not rise with output. */
function fitLine(levels: Level[]): Line | null {
  const stride = Math.max(1, Math.ceil(levels.length / HR_LOW_FOR_POWER.maxFitPoints))
  const used = levels.filter((_, i) => i % stride === 0)
  const slopes: number[] = []
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const dx = used[j]!.output - used[i]!.output
      if (dx !== 0) slopes.push((used[j]!.heartRate - used[i]!.heartRate) / dx)
    }
  }
  if (slopes.length === 0) return null
  const slope = quantile(slopes, 0.5)
  if (!(slope > 0 && Number.isFinite(slope))) return null
  const intercept = quantile(
    used.map((level) => level.heartRate - slope * level.output),
    0.5,
  )
  return { intercept, slope }
}

/** The ids whose level is under maxShare of the line's heart rate at their output. */
function lowAgainst(levels: Level[], line: Line): Set<string> {
  const low = new Set<string>()
  for (const level of levels) {
    const expected = line.intercept + line.slope * level.output
    if (expected > 0 && level.heartRate < HR_LOW_FOR_POWER.maxShare * expected) low.add(level.id)
  }
  return low
}

/**
 * The activities whose heart rate reads low for the power across the whole activity (see HR_LOW_FOR_POWER): a
 * strap that locked onto cadence for most of an endurance ride has a median heart rate far under the athlete's
 * at that power. The line is the library's for the sport, fitted robustly, then refitted without the activities
 * it first set aside so they do not pull it down; the verdict is taken against the second line. A sport with too
 * few activities to fit gives no verdict.
 */
export function lowForPowerSetAside(digests: ActivityDigest[]): Set<string> {
  const bySport = new Map<Sport, Level[]>()
  for (const digest of digests) {
    const level = levelOf(digest)
    if (level !== null) bySport.set(digest.sport, [...(bySport.get(digest.sport) ?? []), level])
  }
  const out = new Set<string>()
  for (const levels of bySport.values()) {
    if (levels.length < HR_LOW_FOR_POWER.minActivities) continue
    const first = fitLine(levels)
    if (first === null) continue
    const kept = levels.filter((level) => !lowAgainst(levels, first).has(level.id))
    const line = kept.length >= HR_LOW_FOR_POWER.minActivities ? fitLine(kept) : first
    if (line === null) continue
    for (const id of lowAgainst(levels, line)) out.add(id)
  }
  return out
}
