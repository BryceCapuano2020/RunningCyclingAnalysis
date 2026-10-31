import type { Activity, ActivityDigest } from './types'
import type { RejectedFile } from './sessionState'

/** What an import reports when it is done. */
export interface ImportCompletion {
  /** The activities read, which a file may hold several of. */
  activities: number
  /** The files that added a workout the library now holds and shows: not refused, and not all already held or hidden as copies. */
  filesAdded: number
  rejected: number
  /** Activity files the export's list does not name, such as saved routes, left unread and not counted as rejected. */
  notActivities: number
  /** Activities whose file says one sport and whose export's list names the other (a FIT run listed as a Ride): the file wins. Absent when none. */
  listedAsOtherSport?: number
  duplicates: RejectedFile[]
  /** The digests of workouts the library gained. */
  added: ActivityDigest[]
  /** The digests that replaced a workout held out of the analysis by an older model: not new, so never a new best. */
  upgraded: ActivityDigest[]
  /** The type the export's list gives each file it names one for, by file name. Absent when the import read no list. */
  listedTypes?: ReadonlyMap<string, string>
}

/**
 * Optional listeners that follow the library an import builds. Each is told only of an activity the
 * library keeps, or of the held file read again, so nothing is recorded for a different copy that is
 * skipped or hidden. A listener that throws or rejects never changes whether an activity is
 * analysed or saved.
 */
export interface ActivityListeners {
  /**
   * The activity the library now holds, whose digest was made from it. `held` is true when the
   * library already held this workout, so the activity is the held file read again or a retried save
   * of it. It is false for a workout the library gains, including a richer copy that replaces a held one.
   */
  kept?: (activity: Activity, info: { held: boolean }) => void | Promise<void>
  /** The id of a held copy that a richer copy of the same workout replaced, which the library no longer holds. */
  replaced?: (id: string) => void | Promise<void>
}

/**
 * Tells the listeners which activity the library kept, and which held copy it replaced. `held` is
 * the digest the library held for this workout before the activity, if any: the activity is that
 * held workout again when `digest` is it, and replaces it when `digest` is another.
 */
export async function noteKept(
  activity: Activity,
  digest: ActivityDigest,
  held: ActivityDigest | undefined,
  listeners: ActivityListeners | undefined,
): Promise<void> {
  if (listeners === undefined) return
  try {
    if (held !== undefined && held !== digest && held.id !== digest.id)
      await listeners.replaced?.(held.id)
  } catch {
    // Optional bookkeeping must never change whether an activity is analysed or saved.
  }
  try {
    // A held digest kept for a retried save was made from another file, not from this activity.
    if (digest.id === activity.id)
      await listeners.kept?.(activity, { held: held !== undefined && held === digest })
  } catch {
    // As above.
  }
}
