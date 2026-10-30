import {
  DISTANCE_BEST_TOLERANCE,
  MAX_KM_SPLITS,
  MAX_MILE_SPLITS,
  RUN_RECORD_DISTANCES_M,
} from '../constants'
import type { DigestDistanceBest, DigestSplit, DigestSplits } from '../types'
import {
  asArray,
  asObject,
  asPositive,
  asBetween,
  fail,
  failRange,
  whenOutOfRange,
} from './parseValue'
import {
  MAX_ACTIVITY_CLIMB_M,
  MAX_ACTIVITY_S,
  MAX_DIGEST_HEART_RATE,
  MAX_DISTANCE_BESTS_READ,
  MAX_SPLIT_DISTANCE_M,
} from './readLimits'
import { nullIn, within } from './readParts'
import type { DigestRules } from './readRules'

/** The lists of a run's digest that only runs have: distance bests and splits. */

/** A best, or null when a tolerant reader drops it: a distance it does not know, or a time out of bounds. */
function readDistanceBest(
  entry: unknown,
  path: string,
  durationS: number,
  rules: DigestRules,
): DigestDistanceBest | null {
  const o = asObject(entry, path)
  return whenOutOfRange<DigestDistanceBest | null>(rules.tolerant, null, () => {
    const seconds = asPositive(o.seconds, `${path}.seconds`)
    // A time scaled up from a stretch a little short of its distance may pass the activity's by at
    // most the distance tolerance, whether or not the run covers the distance in full.
    if (!(seconds <= durationS / (1 - DISTANCE_BEST_TOLERANCE))) {
      failRange(`${path}.seconds`, 'must not exceed durationS')
    }
    // A distance is a number; one this build does not record is another build's, and may be dropped.
    const named = asPositive(o.distanceM, `${path}.distanceM`)
    const distanceM = RUN_RECORD_DISTANCES_M.find((m) => m === named)
    if (distanceM === undefined) failRange(`${path}.distanceM`, 'is not a run record distance')
    return { distanceM, seconds }
  })
}

/**
 * Distance bests are optional, so a digest from before the field is read without one. Each is at a
 * record distance and no slower than the activity allows, and they ascend. A tolerant reader drops a
 * best it cannot take and one that does not ascend; any other reader refuses the digest. Whether the
 * run covers each distance, and whether it is a run at all, is the caller's to check.
 */
export function readDistanceBests(
  value: unknown,
  durationS: number,
  rules: DigestRules,
): DigestDistanceBest[] {
  const list = within(
    asArray(value, 'distanceBests'),
    MAX_DISTANCE_BESTS_READ,
    'distanceBests',
    rules,
  )
  const bests: DigestDistanceBest[] = []
  list.forEach((entry, i) => {
    const best = readDistanceBest(entry, `distanceBests[${i}]`, durationS, rules)
    if (best === null) return
    const last = bests.at(-1)
    if (last !== undefined && best.distanceM <= last.distanceM) {
      if (rules.tolerant) return
      failRange('distanceBests', 'must be in ascending distance')
    }
    bests.push(best)
  })
  return within(bests, RUN_RECORD_DISTANCES_M.length, 'distanceBests', rules)
}

/** The bests at distances the run covers. A run whose distance is unknown keeps its bests unless the rules need it. */
export function coveredBests(
  bests: DigestDistanceBest[],
  distanceM: number,
  rules: DigestRules,
): DigestDistanceBest[] {
  if (Number.isNaN(distanceM) && !rules.bestsNeedDistance) return bests
  const covered = (best: DigestDistanceBest) =>
    best.distanceM * (1 - DISTANCE_BEST_TOLERANCE) <= distanceM
  if (rules.tolerant) return bests.filter(covered)
  const uncovered = bests.findIndex((best) => !covered(best))
  if (uncovered >= 0)
    failRange(`distanceBests[${uncovered}]`, 'the run does not cover this distance')
  return bests
}

function readSplit(value: unknown, path: string, rules: DigestRules): DigestSplit {
  const o = asObject(value, path)
  const known = (key: string, max: number) => nullIn(rules, o[key], `${path}.${key}`, 0, max)
  const split = {
    distanceM: whenOutOfRange<number | null>(rules.tolerant, null, () =>
      asBetween(o.distanceM, `${path}.distanceM`, 0, MAX_SPLIT_DISTANCE_M),
    ),
    seconds: known('seconds', MAX_ACTIVITY_S),
    gradeAdjustedSeconds: known('gradeAdjustedSeconds', MAX_ACTIVITY_S),
    elevationGainM: known('elevationGainM', MAX_ACTIVITY_CLIMB_M),
    avgHeartRate: known('avgHeartRate', MAX_DIGEST_HEART_RATE),
  }
  // A split whose distance cannot be taken has no pace and is not a whole split: it is a split of no
  // distance with nothing known, which the run's readings and rows leave out.
  if (split.distanceM === null) {
    return {
      distanceM: 0,
      seconds: null,
      gradeAdjustedSeconds: null,
      elevationGainM: null,
      avgHeartRate: null,
    }
  }
  return { ...split, distanceM: split.distanceM }
}

/** A run over the limit has no splits in that unit, as the digest makes it, so a tolerant reader reads none. */
function readSplitList(
  value: unknown,
  path: string,
  limit: number,
  rules: DigestRules,
): DigestSplit[] {
  const list = asArray(value, path)
  if (list.length > limit) {
    if (rules.tolerant) return []
    fail(path, `must have at most ${limit} entries`)
  }
  return list.map((s, i) => readSplit(s, `${path}[${i}]`, rules))
}

export function readSplits(value: unknown, rules: DigestRules): DigestSplits {
  const o = asObject(value, 'splits')
  return {
    km: readSplitList(o.km, 'splits.km', MAX_KM_SPLITS * rules.arrayFactor, rules),
    mile: readSplitList(o.mile, 'splits.mile', MAX_MILE_SPLITS * rules.arrayFactor, rules),
  }
}
