import { revisionStatus } from '@rca/core/digest/revisions'
import {
  copyGroupOf,
  copyOfDigest,
  hiddenDigests,
  outranks,
  workoutKey as storedKey,
} from '@rca/core/duplicates'
import type { AnalysisSession, SessionState, SyncItem } from '@rca/core/session'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import { isAnalysable } from './analysable'
import { deviceFileOf } from './deviceFile'
import { LibraryReplaced } from './deviceFile'
import type { DeviceEntry, DeviceLibrary } from './deviceLibrary'
import type { SavedActivity, WorkerResponse } from './protocol'
import { savedActivityOf } from './savedActivity'

/** Said when the page's own load of the kept results fails: nothing else will load them again. */
export const KEPT_NOT_READ =
  'Your kept results could not be read from this browser just now. Reload the page to try again.'
/** Said when a removal cannot first read what is kept: the removal did not happen. */
export const KEPT_NOT_READ_FOR_REMOVE =
  'Your kept results could not be read from this browser just now, so this activity was not removed. Reload the page to try again.'

/** How long the second try at reading the kept results waits: a lost connection reopens by then. */
const READ_RETRY_MS = 250

export interface DeviceActions {
  /**
   * Replaces the session's library with the one kept in this browser. Rejects when the library
   * cannot be read, after one more try, rather than loading it as empty: an empty library would be
   * taken for the real one. `unreadable` is the message of that rejection.
   */
  load(settings: AthleteSettings, unreadable?: string): Promise<SessionState>
  /** Whether the session holds that library already, so loading it again would drop imports. */
  inSession(): boolean
  /** The session's library was replaced or emptied, so the kept one must be loaded again. */
  replaced(): void
  /** Whether the kept library is still the one this session loaded (false once it was emptied since, or when storage will not say). */
  current(): Promise<boolean>
  /** Whether activities show here that could not be kept in this browser, which loading the library again would lose. */
  hasUnkept(): boolean
  /**
   * Keeps one imported activity, with its route. Best effort: a refused write leaves the visit
   * working. Resolves 'refused' when the write was refused, 'replaced' when the library was emptied since this session loaded it, 'newer' when a row this version cannot
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
   * Drops the copy kept in this browser of a workout, if there is one, without touching the session or
   * posting the list, which a signed-in visitor does not see; it posts only whether the library still holds
   * anything (`deviceHolds`). A signed-in delete uses it, so the copy cannot come back when the visitor signs
   * out. It rejects when the library cannot be read, never claiming a copy gone that may be there.
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
export type DeviceSave = 'kept' | 'refused' | 'newer' | 'replaced'

export function workoutKeyOf(digest: Pick<ActivityDigest, 'sport' | 'startMs'>): string {
  return storedKey(digest.sport, digest.startMs)
}

/**
 * Whether a new copy of a workout should replace the kept one: always when the kept one is from an
 * older analysis model, never when a newer version of the app wrote it, otherwise only when the
 * session would prefer the new copy too.
 */
function replaces(next: ActivityDigest, kept: ActivityDigest | null): boolean {
  if (kept === null) return true
  const status = revisionStatus(kept.modelRevision)
  if (status === 'newer') return false
  if (status !== 'current') return true
  return outranks(copyOfDigest(next), copyOfDigest(kept))
}

function newestFirst(entries: DeviceEntry[]) {
  // Every distinct second is kept (rule R); the list shows the best copy of each workout.
  const hidden = hiddenDigests(entries.map(({ digest }) => digest).filter(isAnalysable))
  return entries
    .filter(({ digest }) => !hidden.has(digest))
    .map(({ workoutKey, digest }) => savedActivityOf(workoutKey, digest))
    .sort((a, b) => b.startMs - a.startMs || a.id.localeCompare(b.id))
}

/** The list posted to the page: the activities, and how many rows were kept but not read when there were some. */
function listed(activities: SavedActivity[], skipped: number): WorkerResponse {
  return { type: 'libraryActivities', activities, ...(skipped > 0 ? { skipped } : {}) }
}

/** The device library's requests, run on the worker's session. */
export function deviceActions(
  session: AnalysisSession,
  device: DeviceLibrary,
  post: (message: WorkerResponse) => void,
  onRemoved: (activityId: string) => Promise<boolean> = async () => true,
  /** Called each time the library's epoch is read, so what else is kept for the library (its recordings) reads its own. */
  onEpoch: () => Promise<void> = async () => undefined,
): DeviceActions {
  let held = false
  // The library's epoch (see DeviceLibrary.epoch) when this session loaded or last emptied it, or null when
  // not known yet. Every write carries it, so a library emptied in another tab since is not written to.
  let epochSeen: number | null = null
  // Activities that show but could not be kept since the library was loaded: a reload would drop them.
  let unkept = 0
  const report = async () => {
    try {
      // A failed read rejects, which leaves the list on screen as it is instead of replacing it with none.
      const entries = await device.all()
      post(listed(newestFirst(entries), device.skipped()))
    } catch {
      // The list is shown again after the next change.
    }
  }
  return {
    async load(settings, unreadable = KEPT_NOT_READ) {
      // Read before the rows: a clear between the two then fails this session's writes, not lets them through.
      // A library whose epoch cannot be read is one that cannot be written to safely, so it is not loaded.
      const readAll = async () => {
        const epoch = await device.epoch()
        await onEpoch()
        const rows = await device.all()
        return { epoch, rows }
      }
      // One failed read can be a connection the browser dropped, which the next call opens again.
      const loaded = await readAll().catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, READ_RETRY_MS))
        return readAll().catch(() => {
          throw new Error(unreadable)
        })
      })
      const entries = loaded.rows
      epochSeen = loaded.epoch
      unkept = 0
      post(listed(newestFirst(entries), device.skipped()))
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
      epochSeen = null
      unkept = 0
    },
    async current() {
      if (epochSeen === null) return true
      // Storage that will not say is not taken for unchanged: the import is stopped, not trusted.
      return (await device.epoch().catch(() => null)) === epochSeen
    },
    hasUnkept() {
      return unkept > 0
    },
    async save({ digest, route, fileName, fileHash }) {
      try {
        const key = workoutKeyOf(digest)
        const file = deviceFileOf({ fileName, fileHash })
        // A session that never loaded the library takes the epoch it finds at its first write.
        if (epochSeen === null) {
          epochSeen = await device.epoch()
          await onEpoch()
        }
        const kept = await device.lookup(key)
        // A row a newer version wrote is left as it is: writing over it would destroy what that
        // version made. One that is damaged or from an older format is written over, so it heals.
        if (kept === 'newer') return 'newer'
        if (replaces(digest, kept === 'unreadable' ? null : kept)) {
          await device.put(key, digest, route, file, epochSeen)
        } else if (
          file !== null &&
          kept !== null &&
          kept !== 'unreadable' &&
          kept.id === digest.id
        ) {
          // The same file again: a row kept before files were recorded gets its hash now.
          await device.backfillFile(key, digest.id, file)
        }
        return 'kept'
      } catch (error) {
        // The library was emptied since this session loaded it: nothing more of this import belongs in it.
        if (error instanceof LibraryReplaced) return 'replaced'
        // Storage can be refused (a private window, a full disk); the results still show.
        unkept++
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
      // A strict read: a copy that could not be read is not a copy that is gone, so a failed read says so rather
      // than "no longer kept". A row this version cannot read is not removed from here, since it has no digest to drop.
      const found = await device.lookup(id).catch(() => {
        throw new Error(KEPT_NOT_READ_FOR_REMOVE)
      })
      if (found === null) throw new Error('This activity is no longer kept in this browser.')
      if (typeof found === 'string') throw new Error(KEPT_NOT_READ_FOR_REMOVE)
      const kept = found
      // The activity the athlete sees stands for its whole group of near-copies: deleting only it would let a hidden
      // copy take its place. The one asked for goes first.
      const entries = await device.all().catch(() => {
        throw new Error(KEPT_NOT_READ_FOR_REMOVE)
      })
      // Among the digests the analysis reads, as the list and the export are: a stale copy is no copy of anything.
      const readable = entries.filter((entry) => isAnalysable(entry.digest))
      const self = readable.find((entry) => entry.workoutKey === id)
      const group =
        self === undefined
          ? []
          : copyGroupOf(
              readable.map((e) => e.digest),
              self.digest,
            )
      const members = [
        { workoutKey: id, digest: kept },
        ...readable.filter(
          (entry) => entry.workoutKey !== id && group.some((digest) => digest === entry.digest),
        ),
      ]
      const removed: typeof members = []
      let state: SessionState | null = null
      let cleared = true
      try {
        for (const member of members) {
          await device.remove(member.workoutKey)
          removed.push(member)
          cleared = (await onRemoved(member.digest.id).catch(() => false)) && cleared
        }
      } finally {
        // Those already removed are gone from the list and the session whether or not a later one failed.
        if (!cleared) post({ type: 'deviceIssue', issue: 'notForgotten' })
        await report()
        for (const { digest } of removed) {
          state = session.removeActivity(digest.sport, digest.startMs, settings)
        }
      }
      return state!
    },
    async dropKept(workoutKey) {
      // A strict read, then a removal of whatever is there, so a copy is never claimed gone that may not be.
      if ((await device.lookup(workoutKey)) === null) return
      await device.remove(workoutKey)
      // The page keeps a mark of whether this browser's library holds anything; a signed-in delete may have emptied it.
      try {
        const left = await device.all()
        post({ type: 'deviceHolds', holds: left.length > 0 || device.skipped() > 0 })
      } catch {
        // Unknown what is left, so the mark is left as it is.
      }
    },
    async forget() {
      try {
        await device.clear()
      } catch {
        // A clear is refused too when storage cannot be opened at all, with nothing ever kept. Only
        // what remains reloads next visit, so the page shows that and says so. The page still starts
        // over, and the next read loads what remains into the session. A read that fails after the
        // refusal leaves it unknown what remains, so that is said too.
        const remaining = await device.all().catch(() => null)
        if (remaining === null || remaining.length > 0) {
          held = false
          if (remaining !== null) post(listed(newestFirst(remaining), device.skipped()))
          post({ type: 'deviceIssue', issue: 'notForgotten' })
          return false
        }
      }
      post(listed([], 0))
      // Nothing to merge once empty, and the clear began a new epoch that this session now writes to.
      held = true
      epochSeen = await device.epoch().catch(() => null)
      await onEpoch()
      unkept = 0
      return true
    },
  }
}
