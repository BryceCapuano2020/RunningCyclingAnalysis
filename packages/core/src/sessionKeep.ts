import { digestActivity } from './digest'
import { workoutKey, fileNameOf, heldCopyOf, outranksHeld } from './duplicates'
import {
  NETWORK_FAILURES_BEFORE_PROBE,
  NETWORK_PROBE_DELAY_MS,
  networkStreakAfter,
  stopsSaving,
  SyncFailure,
} from './saveFailure'
import type { SyncIssueCode } from './saveFailure'
import { noteKept } from './sessionHooks'
import type { ActivityListeners } from './sessionHooks'
import type { SessionLibrary } from './sessionLibrary'
import type { Considered } from './sessionSource'
import type { ImportedFile, SaveBatch, SyncSink } from './sessionSync'
import type { Activity, ActivityDigest } from './types'

/**
 * The session's library bookkeeping that keeping an activity reads and changes. The maps are the
 * session's own (never replaced, only emptied), so this object and the session always agree.
 */
export interface KeepState {
  library: SessionLibrary
  /** Activities whose last sink call failed, and why. Re-importing the file tries them again. */
  unsynced: Map<string, SyncIssueCode>
  /** The keys the latest import left in `unsynced`, so its own failures can be told from earlier ones. */
  latestUnsynced: Set<string>
}

/**
 * The digests a new copy is compared with: the current ones, and the compatible ones of other workouts. A
 * compatible digest of this very workout is replaced by the new copy whatever its richness, so it is not one.
 */
function* comparable(library: SessionLibrary, key: string): Iterable<ActivityDigest> {
  yield* library.digests.values()
  for (const [other, digest] of library.readable) if (other !== key) yield digest
}

/**
 * Keeps one activity of an import, unless a richer copy of the same workout is already held. That
 * copy is not synced. Equally rich copies are both saved, and the analysis hides one of them. A
 * poorer copy is saved but hidden from the analysis. Says what became of the activity: the digest
 * it added, or the name of the held file when its workout was already in the library, whether this
 * is a copy, the same file again or a richer copy that replaces the held one. The listeners hear of
 * the activity when it is kept, or when it is the held file again, never of another skipped copy.
 */
export async function considerActivity(
  state: KeepState,
  activity: Activity,
  file: ImportedFile,
  sink: SyncSink | undefined,
  syncExisting: boolean,
  batch: SaveBatch,
  listeners?: ActivityListeners,
): Promise<Considered> {
  const copyOf = heldCopyOf(
    comparable(state.library, workoutKey(activity.sport, activity.startMs)),
    activity,
    file.fileName,
  )
  if (copyOf !== null) return { held: copyOf }
  return keepActivity(state, activity, file, sink, syncExisting, batch, listeners)
}

/**
 * Digests one parsed activity and hands it to the sink. An activity already held and saved is left alone
 * unless syncExisting requests a sink call for it (for example, to retain an original after that preference
 * is enabled). A copy that outranks the held one for the same start second replaces it. A sink failure is
 * counted, not thrown. After a failure that stops saving, the rest of the batch is digested but not sent.
 * A held activity whose save failed is not yet in the library for good: it is added when this import saves
 * it, and is otherwise still the held workout, however it came to be left unsaved.
 */
async function keepActivity(
  state: KeepState,
  activity: Activity,
  file: ImportedFile,
  sink: SyncSink | undefined,
  syncExisting: boolean,
  batch: SaveBatch,
  listeners?: ActivityListeners,
): Promise<Considered> {
  const key = workoutKey(activity.sport, activity.startMs)
  const held = state.library.digests.get(key)
  // The same workout held from an older model: a fresh copy replaces it, and the import reports it upgraded.
  const older = held === undefined ? state.library.notCurrent(key) : undefined
  const replaces = held !== undefined && outranksHeld(activity, file.fileName, held)
  if (
    held !== undefined &&
    !replaces &&
    (sink === undefined || (!state.unsynced.has(key) && !syncExisting))
  ) {
    // The same file again restores a recording that went missing; any other copy is only skipped.
    await noteKept(activity, held, held, listeners)
    return { held: fileNameOf(held.id) }
  }
  // A workout this import is adding, or has added: new to the library, or a later copy of one.
  const adding = held === undefined || batch.added.has(key)
  const retry = !adding && state.unsynced.has(key)
  const digest = held !== undefined && !replaces ? held : digestActivity(activity)
  state.library.put(key, digest)
  if (adding) batch.added.set(key, digest)
  if (older !== undefined) batch.upgraded.add(key)
  // A replacing copy is swapped in only once the sink answers: the server may refuse it (409) and keep its own.
  const swapAfterSink = replaces && sink !== undefined && batch.halt === null
  if (!swapAfterSink) await noteKept(activity, digest, held, listeners)
  const considered = (saved: boolean): Considered => {
    if (retry && saved) batch.added.set(key, digest)
    return adding || (retry && saved) || held === undefined
      ? { added: digest }
      : { held: fileNameOf(held.id) }
  }
  if (sink === undefined) return considered(false)
  if (batch.halt !== null) {
    // An activity already saved, offered again to keep its file, is not waiting for a save.
    if (held === undefined || replaces || state.unsynced.has(key)) {
      markUnsynced(state, key, batch.halt)
    }
    return considered(false)
  }
  // After a run of network failures the next save is a probe, sent once the outage has had a moment
  // to pass. If it fails too the network is down and the saves stop; if not, the import carries on.
  const probing = batch.networkStreak >= NETWORK_FAILURES_BEFORE_PROBE
  if (probing) await new Promise((resolve) => setTimeout(resolve, NETWORK_PROBE_DELAY_MS))
  try {
    await sink({ digest, route: activity.route, ...file })
    clearUnsynced(state, key)
    batch.networkStreak = networkStreakAfter(batch.networkStreak, null)
  } catch (error) {
    const code = error instanceof SyncFailure ? error.code : 'server'
    markUnsynced(state, key, code)
    // The server answered when only the original file failed to upload, so the network is up.
    const answered = error instanceof SyncFailure && error.digestSaved
    batch.networkStreak = networkStreakAfter(batch.networkStreak, answered ? null : code)
    if (stopsSaving(code) || (probing && !answered && code === 'network')) batch.halt = code
    if (swapAfterSink && code === 'activity-conflict') {
      // The server keeps the copy it holds, so the screen keeps it too, as a reload would show it.
      state.library.put(key, held)
      if (adding) batch.added.set(key, held)
      return adding ? { added: held } : { held: fileNameOf(held.id) }
    }
    if (swapAfterSink) await noteKept(activity, digest, held, listeners)
    return considered(false)
  }
  if (swapAfterSink) await noteKept(activity, digest, held, listeners)
  return considered(true)
}

/** Notes that the activity is not saved, and why, as a failure of the import in progress. */
export function markUnsynced(state: KeepState, key: string, code: SyncIssueCode): void {
  state.unsynced.set(key, code)
  state.latestUnsynced.add(key)
}

/** Takes the activity off the unsaved list: it was saved, or it is gone. */
export function clearUnsynced(state: KeepState, key: string): void {
  state.unsynced.delete(key)
  state.latestUnsynced.delete(key)
}

/** Empties the unsaved list, with the library it belongs to. */
export function resetUnsynced(state: KeepState): void {
  state.unsynced.clear()
  state.latestUnsynced.clear()
}

/** A new import begins: the unsaved activities stay, but none counts as this import's own yet. */
export function beginImportUnsynced(state: KeepState): void {
  state.latestUnsynced.clear()
}
