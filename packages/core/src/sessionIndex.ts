import { hiddenDigests, workoutKey } from './duplicates'
import { readRank } from './sessionLibrary'
import { clearUnsynced } from './sessionKeep'
import type { KeepState } from './sessionKeep'
import type { SessionState } from './sessionState'
import type { ActivityDigest, DigestSplits, Sport } from './types'

/**
 * The operations on the library a session holds that build no state: an account's page reads its results from the
 * server, and this library is the index its imports, list, deletes and updates read. Functions over `KeepState`, as
 * sessionKeep.ts is, so the session class stays small.
 */

/** What the index knows of the library's age and size, which an account's page reads from it and not from the server's state. */
export type IndexFacts = Pick<
  SessionState,
  'outdatedActivities' | 'incompatibleActivities' | 'libraryActivities' | 'heldOut'
>

export function indexFactsOf({ library }: KeepState): IndexFacts {
  return {
    outdatedActivities: library.countHeldOut('stale'),
    incompatibleActivities: library.countHeldOut('newer'),
    libraryActivities: library.size,
    heldOut: library.heldOutActivities(),
  }
}

/** The ids of the digests the analysis hides as copies of a better one, as the library stands now. */
export function hiddenIds({ library }: KeepState): Set<string> {
  const analysable = library.analysable().map(([, digest]) => digest)
  return new Set([...hiddenDigests(analysable)].map((digest) => digest.id))
}

/** The id of the digest held under each workout key, in the order given; undefined for a key that is not held. */
export function heldIds({ library }: KeepState, keys: readonly string[]): (string | undefined)[] {
  return keys.map((key) => library.digests.get(key)?.id)
}

/**
 * Moves one saved workout to a digest rebuilt from its original file: the digest leaves `readable` or `heldOut` for the
 * map its revision calls for. A workout the library holds at the same or a higher rank than the new digest (another copy
 * already current) is left as it is. Says whether it moved.
 */
export function replaceDigest(
  { library }: KeepState,
  key: string,
  digest: ActivityDigest,
): boolean {
  const held = library.digests.get(key) ?? library.notCurrent(key)
  if (held !== undefined && readRank(held) >= readRank(digest)) return false
  library.put(key, digest)
  return true
}

/** Drops one workout, and its place on the unsaved list. */
export function dropWorkout(state: KeepState, key: string): void {
  state.library.drop(key)
  clearUnsynced(state, key)
}

/** Whether a saved workout is held out of the analysis for being made by an older model. */
export function hasOutdated({ library }: KeepState, sport: Sport, startMs: number): boolean {
  return library.heldOut.get(workoutKey(sport, startMs))?.status === 'stale'
}

/** The run splits of a held activity. Null when it has none or is not held. */
export function splitsOf({ library }: KeepState, id: string): DigestSplits | null {
  for (const digest of [...library.digests.values(), ...library.readable.values()])
    if (digest.id === id) return digest.splits ?? null
  return null
}

/** How a library is replaced: see `fillLibrary`. */
export interface ReplaceOptions {
  keepUnsaved?: boolean
  fromServer?: boolean
  /** The workout keys whose listed record holds the original file. Without it a refused original is never taken for held. */
  withFile?: ReadonlySet<string>
}

/**
 * Fills an emptied library with digests stored elsewhere. The copy the analysis reads most wins, whatever the order; a
 * key that arrives both stale and newer is one row held back. With `fromServer` (the default with `keepUnsaved`: the replacement is the account's library) a
 * workout it holds is saved, so it leaves the unsaved list; a library read from this browser settles nothing. With
 * `keepUnsaved` a workout whose save failed, and which the replacement lacks, stays (from `before`) and stays unsaved, so
 * adding its file again retries it. A workout whose digest was saved and only its original failed stays on the list until
 * its listed record is in `withFile`.
 */
export function fillLibrary(
  state: KeepState,
  digests: readonly ActivityDigest[],
  before: ReadonlyMap<string, ActivityDigest>,
  { keepUnsaved = false, fromServer = keepUnsaved, withFile }: ReplaceOptions,
): void {
  const { library, unsynced } = state
  for (const digest of digests) {
    const key = workoutKey(digest.sport, digest.startMs)
    const kept = library.digests.get(key) ?? library.notCurrent(key)
    if (kept === undefined || readRank(kept) < readRank(digest)) library.put(key, digest)
  }
  for (const key of [...unsynced.keys()]) {
    // A digest that failed to save is settled by listing it; one whose original failed only when the listed record has the file.
    const settled = !state.originalOnly.has(key) || withFile?.has(key) === true
    if (fromServer && library.digests.has(key) && settled) clearUnsynced(state, key)
    else if (keepUnsaved && before.has(key)) library.put(key, before.get(key)!)
  }
}
