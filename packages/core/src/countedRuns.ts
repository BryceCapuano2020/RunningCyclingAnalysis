import type { ActivityDigest } from './types'

/*
 * The athlete's choice to count a run at walking pace as a run. The digest marks such a run and the analysis
 * leaves it out (`ActivityDigest.walkingPace`); the athlete's choice is not part of the digest, which stays as
 * the file made it, so it is applied here, when the session builds its state. A counted run is the digest
 * without the mark, so every reader (the periods, the fitness status, the library list) sees an ordinary run.
 */

// A counted run is the same object each time, so the caches keyed by digest object still hit.
const counted = new WeakMap<ActivityDigest, ActivityDigest>()

/** The digest without its walking-pace mark. */
function unmarked(digest: ActivityDigest): ActivityDigest {
  let copy = counted.get(digest)
  if (copy === undefined) {
    copy = { ...digest }
    Reflect.deleteProperty(copy, 'walkingPace')
    counted.set(digest, copy)
  }
  return copy
}

export interface CountedRuns {
  /** The library, with each counted run unmarked. The same array when nothing is counted. */
  digests: ActivityDigest[]
  /** The workout keys of the walking-pace runs that were counted, sorted. A key naming anything else is ignored. */
  keys: string[]
}

/**
 * Applies the athlete's choice: the walking-pace runs whose workout key is in `chosen` become ordinary runs.
 * `entries` are the library's digests with their workout keys (see `dedupeKey`).
 */
export function applyCountedRuns(
  entries: readonly (readonly [string, ActivityDigest])[],
  chosen: readonly string[] | undefined,
): CountedRuns {
  const digests = entries.map(([, digest]) => digest)
  if (chosen === undefined || chosen.length === 0) return { digests, keys: [] }
  const wanted = new Set(chosen)
  const keys: string[] = []
  const applied = entries.map(([key, digest]) => {
    if (digest.walkingPace !== true || !wanted.has(key)) return digest
    keys.push(key)
    return unmarked(digest)
  })
  return { digests: keys.length === 0 ? digests : applied, keys: keys.sort() }
}
