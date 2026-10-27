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
}

export type SyncSink = (item: SyncItem) => Promise<void>

/** An activity file as the sink receives it. */
export type ImportedFile = Omit<SyncItem, 'digest' | 'route'>

/** State shared by the files of one import: the first failure that stops saving, and what it added. */
export interface SaveBatch {
  halt: SyncIssueCode | null
  /** The digests this import added to the library, by key. A replacement updates its entry. */
  added: Map<string, ActivityDigest>
}
