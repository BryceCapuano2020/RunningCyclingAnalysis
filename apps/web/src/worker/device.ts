import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { copyOfDigest, dedupeKey, outranks } from '@rca/core/duplicates'
import type { AnalysisSession, SessionState, SyncItem } from '@rca/core/session'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import type { DeviceEntry, DeviceLibrary } from './deviceLibrary'
import type { WorkerResponse } from './protocol'
import { savedActivityOf } from './savedActivity'

const KEPT_NOT_READ =
  'Your kept results could not be read from this browser just now. Reload the page to try again.'

export interface DeviceActions {
  /**
   * Replaces the session's library with the one kept in this browser. Rejects when the library
   * cannot be read, rather than loading it as empty: an empty library would be taken for the real one.
   */
  load(settings: AthleteSettings): Promise<SessionState>
  /** Whether the session holds that library already, so loading it again would drop imports. */
  inSession(): boolean
  /** The session's library was replaced or emptied, so the kept one must be loaded again. */
  replaced(): void
  /**
   * Keeps one imported activity, with its route. Best effort: a refused write leaves the visit
   * working. Resolves 'refused' when the write was refused, 'newer' when a row this version cannot
   * read is kept under the workout (one a newer version of the app wrote), which is left as it is,
   * and 'kept' when the activity is kept or the kept copy is the one to keep.
   */
  save(item: SyncItem): Promise<DeviceSave>
  /** The route kept with a workout, or null. Best effort. */
  route(id: string): Promise<RouteShape | null>
  /** Posts the activities kept in this browser, newest first. Best effort. */
  report(): Promise<void>
  remove(id: string, settings: AthleteSettings): Promise<SessionState>
  /**
   * Drops the copy kept in this browser of a workout, if there is one, without touching the session.
   * A signed-in delete uses it, so the copy cannot come back when the visitor signs out.
   */
  dropKept(workoutKey: string): Promise<void>
  /**
   * Empties the library. Best effort, so starting over always clears the page. A refused clear posts
   * the library that remains, with a `notForgotten` issue, and the next call tries the clear again.
   * Resolves true when nothing is left, and false when it posted that issue, so a caller that must
   * report a later refusal of its own can tell the page once.
   */
  forget(): Promise<boolean>
}

/** What keeping an imported activity in this browser came to. See DeviceActions.save. */
export type DeviceSave = 'kept' | 'refused' | 'newer'

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
  onRemoved: (activityId: string) => Promise<boolean> = async () => true,
): DeviceActions {
  let held = false
  const report = async () => {
    try {
      // Strict, so a failed read leaves the list on screen as it is instead of replacing it with none.
      post({ type: 'libraryActivities', activities: newestFirst(await device.allStrict()) })
    } catch {
      // The list is shown again after the next change.
    }
  }
  return {
    async load(settings) {
      const entries = await device.allStrict().catch(() => {
        throw new Error(KEPT_NOT_READ)
      })
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
    async save({ digest, route }) {
      try {
        const key = workoutKeyOf(digest)
        const kept = await device.lookup(key)
        // A row a newer version wrote is left as it is: writing over it would destroy what that
        // version made. One that is damaged or from an older format is written over, so it heals.
        if (kept === 'newer') return 'newer'
        if (replaces(digest, kept === 'unreadable' ? null : kept))
          await device.put(key, digest, route)
        return 'kept'
      } catch {
        // Storage can be refused (a private window, a full disk); the results still show.
        return 'refused'
      }
    },
    async route(id) {
      try {
        return await device.route(id)
      } catch {
        return null
      }
    },
    report,
    async remove(id, settings) {
      const kept = await device.get(id)
      if (!kept) throw new Error('This activity is no longer kept in this browser.')
      await device.remove(id)
      if (!(await onRemoved(kept.id).catch(() => false)))
        post({ type: 'deviceIssue', issue: 'notForgotten' })
      await report()
      return session.removeActivity(kept.sport, kept.startMs, settings)
    },
    async dropKept(workoutKey) {
      if ((await device.get(workoutKey)) === null) return
      await device.remove(workoutKey)
    },
    async forget() {
      try {
        await device.clear()
      } catch {
        // A clear is refused too when storage cannot be opened at all, with nothing ever kept. Only
        // what remains reloads next visit, so the page shows that and says so. The page still starts
        // over, and the next read loads what remains into the session. A read that fails after the
        // refusal leaves it unknown what remains, so that is said too.
        const remaining = await device.allStrict().catch(() => null)
        if (remaining === null || remaining.length > 0) {
          held = false
          if (remaining !== null)
            post({ type: 'libraryActivities', activities: newestFirst(remaining) })
          post({ type: 'deviceIssue', issue: 'notForgotten' })
          return false
        }
      }
      post({ type: 'libraryActivities', activities: [] })
      // Nothing to merge once empty.
      held = true
      return true
    },
  }
}
