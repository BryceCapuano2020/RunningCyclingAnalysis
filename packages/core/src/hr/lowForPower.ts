import { memoByDigests } from '../digestMemo'
import { quantile } from '../math'
import type { ActivityDigest, Sport } from '../types'
import { MEASURED_EFFORT } from './setAside'

/**
 * Heart rate that reads low for the power across a whole activity is set aside too, which the best-effort test
 * cannot see in an endurance ride whose strap failed from minute 25. An activity of at least minMovingS with at
 * least minBlocks heart-rate blocks is judged by its median heart rate at its median output against the
 * library's heart rate at that output for its sport: a robust line fitted over all of them (at most maxFitPoints,
 * for cost). An activity is judged only if its output lies from the judgedFrom to the judgedTo quantile of those
 * fitted, so the line is never extrapolated. Under maxShare of that heart rate sets it aside. A sport with fewer
 * than minActivities such activities is not judged.
 */
export const HR_LOW_FOR_POWER = {
  minMovingS: 1200,
  minBlocks: 3,
  minActivities: 12,
  maxShare: 0.75,
  maxFitPoints: 150,
  judgedFrom: 0.05,
  judgedTo: 0.95,
} as const

/** One activity's level: its median heart rate and its median output over the 5 min blocks, in its sport's unit. */
export interface Level {
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
export interface Line {
  intercept: number
  slope: number
}

/** The robust line through the levels, or null when its slope is not positive: a heart rate that does not rise with output. */
export function fitLine(levels: Level[]): Line | null {
  // Ordered by output, then id, before subsampling, so the line does not depend on the order digests arrive in.
  const ordered = levels.slice().sort((a, b) => a.output - b.output || (a.id < b.id ? -1 : 1))
  const stride = Math.max(1, Math.ceil(ordered.length / HR_LOW_FOR_POWER.maxFitPoints))
  const used = ordered.filter((_, i) => i % stride === 0)
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

/**
 * The ids whose level is under maxShare of the line's heart rate at their output. Only an output within the
 * 5th to 95th percentile of those the line was fitted to is judged: beyond them the line is extrapolated, and a
 * low-output easy ride at its true heart rate would read low against a line steepened by the rest.
 */
function lowAgainst(levels: Level[], line: Line): Set<string> {
  const outputs = levels.map((level) => level.output)
  const from = quantile(outputs, HR_LOW_FOR_POWER.judgedFrom)
  const to = quantile(outputs, HR_LOW_FOR_POWER.judgedTo)
  const low = new Set<string>()
  for (const level of levels) {
    if (level.output < from || level.output > to) continue
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
function judgeLowForPower(digests: ActivityDigest[]): Set<string> {
  const bySport = new Map<Sport, Level[]>()
  for (const digest of digests) {
    const level = levelOf(digest)
    if (level === null) continue
    const own = bySport.get(digest.sport)
    if (own === undefined) bySport.set(digest.sport, [level])
    else own.push(level)
  }
  const out = new Set<string>()
  for (const levels of bySport.values()) {
    if (levels.length < HR_LOW_FOR_POWER.minActivities) continue
    const first = fitLine(levels)
    if (first === null) continue
    const firstLow = lowAgainst(levels, first)
    const kept = levels.filter((level) => !firstLow.has(level.id))
    const line = kept.length >= HR_LOW_FOR_POWER.minActivities ? fitLine(kept) : first
    if (line === null) continue
    for (const id of lowAgainst(levels, line)) out.add(id)
  }
  return out
}

/**
 * The same judgement, remembered for the last few libraries: it reads no body mass, so a change of mass finds it.
 * Each call has a set of its own, since callers add to it.
 */
const judged = memoByDigests(
  judgeLowForPower,
  () => true,
  (ids) => new Set(ids),
)

export function lowForPowerSetAside(digests: ActivityDigest[]): Set<string> {
  return judged(digests, undefined)
}
