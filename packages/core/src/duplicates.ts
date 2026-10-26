import type { Activity, ActivityDigest, Sport } from './types'

/** Format ranks: when copies of one workout exist, the highest-ranked one is analysed. */
const RANK = { fit: 3, tcx: 2, gpx: 1 } as const

/** Two copies start within this many milliseconds to be one workout. */
const NEAR_START_MS = 60_000
/** Durations within this many seconds, or this fraction of the longer one, are the same workout. */
const NEAR_DURATION_S = 60
const NEAR_DURATION_FRACTION = 0.1

/** The fields that decide whether two activities are the same workout. */
export interface Workout {
  sport: Sport
  startMs: number
  durationS: number
}

/** The fields that decide which copy of a workout is kept. */
export interface Copy {
  id: string
  rank: number
  hasPower: boolean
  hasHeartRate: boolean
  durationS: number
}

/** The copy of a digest, with its format rank taken from its id. */
export function copyOfDigest(digest: ActivityDigest): Copy {
  return {
    id: digest.id,
    rank: formatRank(digest.id),
    hasPower: digest.powerSource === 'measured',
    hasHeartRate: digest.hasHeartRate,
    durationS: digest.durationS,
  }
}

/** The copy of an activity read from a file, before it is digested. Matches copyOfDigest. */
export function copyOfActivity(activity: Activity, fileName: string): Copy {
  return {
    id: activity.id,
    rank: formatRank(fileName),
    hasPower: activity.sport === 'ride' && activity.hasPower,
    hasHeartRate: activity.hasHeartRate,
    durationS: activity.n,
  }
}

/**
 * Whether copy a is richer than copy b: format rank first, then a power meter, heart-rate data and
 * the longer duration. Equally rich copies are not richer than each other.
 */
export function richer(a: Copy, b: Copy): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank
  if (a.hasPower !== b.hasPower) return a.hasPower
  if (a.hasHeartRate !== b.hasHeartRate) return a.hasHeartRate
  return a.durationS > b.durationS
}

/**
 * Whether the analysis keeps copy a over copy b: the richer one, and between equally rich copies
 * the smaller id, so the choice does not depend on the order the files arrive in.
 */
export function outranks(a: Copy, b: Copy): boolean {
  if (richer(a, b)) return true
  if (richer(b, a)) return false
  return a.id < b.id
}

/** The same workout exported twice has the same sport and start second. */
export function dedupeKey(sport: Sport, startMs: number): string {
  return `${sport}-${Math.round(startMs / 1000)}`
}

/** The activity file name a digest id was built from: `<startMs>-<fileName>[#index][.part]`. */
export function fileNameOf(digestId: string): string {
  return digestId.replace(/^\d+-/, '').replace(/(#\d+)?(\.\d+)?$/, '')
}

/**
 * The format rank of an activity file name, or of a digest id, which begins with the file name.
 * 0 when the name has no FIT, TCX or GPX extension.
 */
function formatRank(name: string): number {
  const extension = /\.(fit|gpx|tcx)(?=(?:#\d+)?(?:\.\d+)?$)/i.exec(name)?.[1]?.toLowerCase()
  switch (extension) {
    case 'fit':
      return RANK.fit
    case 'tcx':
      return RANK.tcx
    case 'gpx':
      return RANK.gpx
    default:
      return 0
  }
}

/** Same sport, starts within a minute, and lasts the same time within 60 s or 10%. */
export function isSameWorkout(a: Workout, b: Workout): boolean {
  if (a.sport !== b.sport || Math.abs(a.startMs - b.startMs) > NEAR_START_MS) return false
  const gap = Math.abs(a.durationS - b.durationS)
  return (
    gap <= NEAR_DURATION_S || gap <= NEAR_DURATION_FRACTION * Math.max(a.durationS, b.durationS)
  )
}

/**
 * The digests the analysis leaves out. Near-duplicates link into groups, and links are followed
 * transitively (union-find), so a copy linked to the best one only through another copy is also a
 * copy of that workout. Each group keeps its best copy by outranks and hides the rest. Digests are
 * sorted by start, so each one is compared only with those that start within NEAR_START_MS of it.
 */
export function hiddenDigests(digests: ActivityDigest[]): Set<ActivityDigest> {
  const sorted = [...digests].sort((a, b) => a.startMs - b.startMs)
  const parent = sorted.map((_, i) => i)
  const root = (i: number): number => {
    let x = i
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  let first = 0
  for (let j = 0; j < sorted.length; j++) {
    const later = sorted[j]!
    while (later.startMs - sorted[first]!.startMs > NEAR_START_MS) first++
    for (let i = first; i < j; i++) {
      if (isSameWorkout(sorted[i]!, later)) parent[root(i)] = root(j)
    }
  }
  const best = new Map<number, number>()
  for (let i = 0; i < sorted.length; i++) {
    const group = root(i)
    const current = best.get(group)
    if (
      current === undefined ||
      outranks(copyOfDigest(sorted[i]!), copyOfDigest(sorted[current]!))
    ) {
      best.set(group, i)
    }
  }
  const hidden = new Set<ActivityDigest>()
  sorted.forEach((digest, i) => {
    if (best.get(root(i)) !== i) hidden.add(digest)
  })
  return hidden
}

/**
 * Why a copy read from a file is not kept: a richer copy of the same workout is already held.
 * Null when no held copy outranks it.
 */
export function heldCopyOf(
  held: Iterable<ActivityDigest>,
  activity: Activity,
  fileName: string,
): string | null {
  const workout: Workout = {
    sport: activity.sport,
    startMs: activity.startMs,
    durationS: activity.n,
  }
  const candidate = copyOfActivity(activity, fileName)
  for (const digest of held) {
    if (isSameWorkout(digest, workout) && richer(copyOfDigest(digest), candidate)) {
      return fileNameOf(digest.id)
    }
  }
  return null
}

/** Whether a copy read from a file outranks the digest held for the same start second. */
export function outranksHeld(activity: Activity, fileName: string, held: ActivityDigest): boolean {
  return richer(copyOfActivity(activity, fileName), copyOfDigest(held))
}
