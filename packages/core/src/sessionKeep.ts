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
import type { Considered } from './sessionSource'
import type { ImportedFile, SaveBatch, SyncSink } from './sessionSync'
import type { Activity, ActivityDigest } from './types'

/**
 * The session's library bookkeeping that keeping an activity reads and changes. The maps are the
 * session's own (never replaced, only emptied), so this object and the session always agree.
 */
export interface KeepState {
  digests: Map<string, ActivityDigest>
  /** Activities whose last sink call failed, and why. Re-importing the file tries them again. */
  unsynced: Map<string, SyncIssueCode>
  /** The keys the latest import left in `unsynced`, so its own failures can be told from earlier ones. */
  latestUnsynced: Set<string>
  outdatedKeys: Set<string>
  incompatibleKeys: Set<string>
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
  const copyOf = heldCopyOf(state.digests.values(), activity, file.fileName)
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
  const held = state.digests.get(key)
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
  state.digests.set(key, digest)
  if (adding) batch.added.set(key, digest)
  state.outdatedKeys.delete(key)
  state.incompatibleKeys.delete(key)
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
  // A workout new to the library has nothing to wait for, so its save may run beside the others. Anything else
  // (a replacement, a retry) is settled after the saves already begun, so two saves of one workout never overlap.
  const queueable = adding && !replaces && !retry && held === undefined
  if (!queueable) await Promise.all(batch.inflight)
  try {
    const sent = await sink({ digest, route: activity.route, ...file, queueable })
    if (sent !== undefined) {
      batch.inflight.push(settleLater(state, batch, key, probing, sent.done))
      return considered(false)
    }
    clearUnsynced(state, key)
    batch.networkStreak = networkStreakAfter(batch.networkStreak, null)
  } catch (error) {
    const code = failureOf(error)
    markUnsynced(state, key, code.code)
    batch.networkStreak = networkStreakAfter(batch.networkStreak, code.answered ? null : code.code)
    if (stopsSaving(code.code) || (probing && !code.answered && code.code === 'network')) {
      batch.halt = code.code
    }
    if (swapAfterSink && code.code === 'activity-conflict') {
      // The server keeps the copy it holds, so the screen keeps it too, as a reload would show it.
      state.digests.set(key, held)
      if (adding) batch.added.set(key, held)
      return adding ? { added: held } : { held: fileNameOf(held.id) }
    }
    if (swapAfterSink) await noteKept(activity, digest, held, listeners)
    return considered(false)
  }
  if (swapAfterSink) await noteKept(activity, digest, held, listeners)
  return considered(true)
}

/** Why a save failed, and whether the server answered (only the original file failed, so the network is up). */
function failureOf(error: unknown): { code: SyncIssueCode; answered: boolean } {
  const code = error instanceof SyncFailure ? error.code : 'server'
  return { code, answered: error instanceof SyncFailure && error.digestSaved }
}

/**
 * Settles a save that ran in the background as the inline path does: saved, or unsaved with its reason, and
 * the network and halting rules applied. Never rejects, so the import can wait for every save together.
 */
function settleLater(
  state: KeepState,
  batch: SaveBatch,
  key: string,
  probing: boolean,
  done: Promise<void>,
): Promise<void> {
  return done.then(
    () => {
      clearUnsynced(state, key)
      batch.networkStreak = networkStreakAfter(batch.networkStreak, null)
    },
    (error: unknown) => {
      const { code, answered } = failureOf(error)
      markUnsynced(state, key, code)
      batch.networkStreak = networkStreakAfter(batch.networkStreak, answered ? null : code)
      if (stopsSaving(code) || (probing && !answered && code === 'network')) batch.halt = code
    },
  )
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
