import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { copyOfDigest, dedupeKey, outranks } from '@rca/core/duplicates'
import type { AnalysisSession, SessionState, SyncItem } from '@rca/core/session'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import type { DeviceEntry, DeviceLibrary } from './deviceLibrary'
import type { WorkerResponse } from './protocol'
import { savedActivityOf } from './savedActivity'

export interface DeviceActions {
  /** Replaces the session's library with the one kept in this browser. */
  load(settings: AthleteSettings): Promise<SessionState>
  /** Whether the session holds that library already, so loading it again would drop imports. */
  inSession(): boolean
  /** The session's library was replaced or emptied, so the kept one must be loaded again. */
  replaced(): void
  /** Keeps one imported activity. Best effort: a refused write leaves the visit working. */
  save(item: SyncItem): Promise<void>
  /** Posts the activities kept in this browser, newest first. Best effort. */
  report(): Promise<void>
  remove(id: string, settings: AthleteSettings): Promise<SessionState>
  /** Empties the library. Best effort, so starting over always clears the page. */
  forget(): Promise<void>
}

export function workoutKeyOf(digest: Pick<ActivityDigest, 'sport' | 'startMs'>): string {
  return dedupeKey(digest.sport, digest.startMs)
}

/**
 * Whether a new copy of a workout should replace the kept one: always when the kept one is from an
 * older analysis model, never when a newer version of the app wrote it, otherwise only when the
 * session would prefer the new copy too.
 */
function replaces(next: ActivityDigest, kept: ActivityDigest | null): boolean {
  if (kept === null || kept.modelRevision < MODEL_REVISION) return true
  if (kept.modelRevision > MODEL_REVISION) return false
  return outranks(copyOfDigest(next), copyOfDigest(kept))
}

function newestFirst(entries: DeviceEntry[]) {
  return entries
    .map(({ workoutKey, digest }) => savedActivityOf(workoutKey, digest))
    .sort((a, b) => b.startMs - a.startMs || a.id.localeCompare(b.id))
}

/** The device library's requests, run on the worker's session. */
export function deviceActions(
  session: AnalysisSession,
  device: DeviceLibrary,
  post: (message: WorkerResponse) => void,
): DeviceActions {
  let held = false
  const report = async () => {
    try {
      post({ type: 'libraryActivities', activities: newestFirst(await device.all()) })
    } catch {
      // The list is shown again after the next change.
    }
  }
  return {
    async load(settings) {
      const entries = await device.all()
      post({ type: 'libraryActivities', activities: newestFirst(entries) })
      const state = session.loadDigests(
        entries.map((entry) => entry.digest),
        settings,
      )
      held = true
      return state
    },
    inSession() {
      return held
    },
    replaced() {
      held = false
    },
    async save({ digest }) {
      try {
        const key = workoutKeyOf(digest)
        if (replaces(digest, await device.get(key))) await device.put(key, digest)
      } catch {
        // Storage can be refused (a private window, a full disk); the results still show.
      }
    },
    report,
    async remove(id, settings) {
      const kept = await device.get(id)
      if (!kept) throw new Error('This activity is no longer kept on this device.')
      await device.remove(id)
      await report()
      return session.removeActivity(kept.sport, kept.startMs, settings)
    },
    async forget() {
      let cleared = false
      try {
        await device.clear()
        cleared = true
      } catch {
        // The page still starts over; whatever could not be removed reloads next visit.
      }
      post({ type: 'libraryActivities', activities: [] })
      // Nothing to merge once empty. After a refused clear, the next read loads what remains.
      held = cleared
    },
  }
}
