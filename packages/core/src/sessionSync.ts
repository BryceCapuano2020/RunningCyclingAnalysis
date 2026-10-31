import type { RouteShape } from './route/routeShape'
import type { SyncIssueCode } from './saveFailure'
import type { ActivityDigest } from './types'

/** What the sink receives for each newly digested activity. */
export interface SyncItem {
  digest: ActivityDigest
  /** The activity file's name inside its source (a zip entry path, or the file name). */
  fileName: string
  /** Lowercase hex SHA-256 of bytes. */
  fileHash: string
  /** The activity file's bytes. The session drops its reference once the sink returns. */
  bytes: Uint8Array
  /** The route shape of the activity, when it has a GPS track. Kept on the device, never uploaded. */
  route?: RouteShape
  /**
   * Whether the sink may save this one in the background and answer at once with a `QueuedSave`. True only for
   * a workout new to the library, which has nothing to wait for: replacing a copy, or retrying a failed save,
   * is settled before the next file is considered.
   */
  queueable?: boolean
}

/** A save the sink began and has not finished. It settles when the save does, and rejects with its failure. */
export interface QueuedSave {
  done: Promise<void>
}

/**
 * Saves one activity. Resolves when it is saved, or throws a SyncFailure saying why not. A sink that was
 * allowed to (`queueable`) may instead resolve at once with a QueuedSave, so several saves run together.
 */
export type SyncSink = (item: SyncItem) => Promise<void | QueuedSave>

/** An activity file as the sink receives it. */
export type ImportedFile = Omit<SyncItem, 'digest' | 'route' | 'queueable'>

/** State shared by the files of one import: the first failure that stops saving, the network failures in a row, and what it added. */
export interface SaveBatch {
  halt: SyncIssueCode | null
  /** Network failures in a row, which end the saves when the network is down. */
  networkStreak: number
  /** The digests this import added to the library, by key. A replacement updates its entry. */
  added: Map<string, ActivityDigest>
  /** Saves begun in the background and not yet settled. Each settles itself and never rejects. */
  inflight: Promise<void>[]
  /** The background save of each workout key still in flight, so a second copy of the key can wait for its outcome. */
  inflightByKey: Map<string, Promise<void>>
  /** The save sent to find out whether the network is back, while it is out. The other saves wait on it. */
  probe: { settled: Promise<void>; end: () => void } | null
  /** The keys of `added` that replaced a digest held out of the analysis, which are upgraded and not new. */
  upgraded: Set<string>
}
