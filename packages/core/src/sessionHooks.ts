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
  duplicates: RejectedFile[]
  added: ActivityDigest[]
}

/**
 * Optional listeners that follow the library an import builds. Each is told only of an activity the
 * library keeps, or of the held file read again, so nothing is recorded for a different copy that is
 * skipped or hidden. A listener that throws or rejects never changes whether an activity is
 * analysed or saved.
 */
export interface ActivityListeners {
  /** The activity the library now holds, whose digest was made from it. */
  kept?: (activity: Activity) => void | Promise<void>
  /** The id of a held copy that a richer copy of the same workout replaced, which the library no longer holds. */
  replaced?: (id: string) => void | Promise<void>
}

/** Tells the listeners which activity the library kept, and which held copy it replaced. */
export async function noteKept(
  activity: Activity,
  digest: ActivityDigest,
  replaced: ActivityDigest | undefined,
  listeners: ActivityListeners | undefined,
): Promise<void> {
  if (listeners === undefined) return
  try {
    if (replaced !== undefined && replaced.id !== digest.id) await listeners.replaced?.(replaced.id)
  } catch {
    // Optional bookkeeping must never change whether an activity is analysed or saved.
  }
  try {
    // A held digest kept for a retried save was made from another file, not from this activity.
    if (digest.id === activity.id) await listeners.kept?.(activity)
  } catch {
    // As above.
  }
}
