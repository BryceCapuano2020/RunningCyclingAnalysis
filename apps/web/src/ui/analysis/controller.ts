import type { PeriodChoice, SessionState, SyncIssueCode } from '@rca/core/session'
import type { DigestSplits } from '@rca/core/types'
import type {
  CheckInView,
  DeviceIssue,
  ImportOutcome,
  SavedActivity,
  SeenEvent,
  WorkerResponse,
  ActivityTraceReply,
} from '../../worker/protocol'
import type { ImportChange } from './importState'
import type {
  AdoptionOutcome,
  DetailCoverage,
  DeviceOfferStatus,
  ImportProgress,
  LibraryStatus,
  OutboxStatus,
} from './model'
import type { RouteReply } from '../routeReply'
import type { ImportManifest } from '../importManifest'

export interface AnalysisController {
  state: SessionState
  /** Import work is in progress or waiting. A library change such as a delete is not counted. */
  busy: boolean
  /** Why an import is held or paused, or null when nothing is waiting. */
  waitingReason: string | null
  /** Activity files read so far during an import, with the total when it is known. */
  progress: ImportProgress | null
  /** Number of files uploaded so far during an import that keeps files, otherwise null. */
  uploading: number | null
  /** The activities the last signed-in import saved, as its reply counted them. Null until one ends. */
  savedCount: number | null
  error: string | null
  /** The worker's reason for `error`, when the page words that error specially. */
  errorIssue: SyncIssueCode | null
  /** `error` is news the visitor asked for, such as a stop, rather than a fault. */
  errorNeutral: boolean
  workerStopped: boolean
  stop: () => void
  retryWorker: () => void
  libraryStatus: LibraryStatus
  /** A reload of a visit that kept results, before the library they kept has been read. */
  restoring: boolean
  /** Reads the signed-in library again. Imports are not held for a failed load; they must be added again. */
  retryLibrary: () => void
  /** Sends the saves the outbox holds now, without reading the library again; the notice follows their end. */
  resumeSaves: () => void
  /** Which activities this browser holds detailed readings for; null until storage has said, and for a sample. */
  detail: DetailCoverage | null
  /** Saved activities whose original file is not in the library. */
  missingOriginals: number
  /** Outdated saved activities whose original file is held, which Update now can rebuild. */
  outdatedWithOriginal: number
  /** "Since your last import" for the library on screen, and whether the athlete has seen it. */
  checkIn: CheckInView
  /** The athlete opened, hid or was shown the check-in row. */
  markCheckInSeen: (event: SeenEvent) => void
  markLookBackSeen: (event: SeenEvent, lead: string) => void
  /** Stored activities that could not be read in the last library load, and so are hidden. */
  libraryUnreadable: number
  /** What this browser failed to keep or delete, until the next try; null when nothing failed. */
  deviceIssue: DeviceIssue | null
  /** How the saves an earlier visit left behind are going and ended; null when there were none. */
  outbox: OutboxStatus | null
  /** What this browser kept from before sign-in that the signed-in account could take; null when nothing is offered. */
  deviceOffer: DeviceOfferStatus | null
  /** How the last adding of those activities to the account ended; null before one has. */
  adoption: AdoptionOutcome | null
  /** Adds the activities kept in this browser to the signed-in account. */
  adoptDevice: () => void
  /** Removes the library kept in this browser, leaving the account as it is. */
  forgetDeviceLibrary: () => void
  /** Puts the result of adding them away. */
  dismissAdoption: () => void
  importOutcome: ImportOutcome | null
  /** The latest import that left the library short of the whole history (cut off, or from a damaged zip), or null. */
  incompleteImport: ImportManifest | null
  /** Goes on with what the library holds: the notice about the incomplete import goes. */
  acceptIncompleteImport: () => void
  /** What the last import moved from, while its summary is shown; null otherwise. */
  importChange: ImportChange | null
  /** The summary was dismissed, so what moved goes with it. */
  dismissSummary: () => void
  savedActivities: SavedActivity[]
  /** A library change in progress. It does not make the import dropzone busy. */
  libraryAction: 'deleting' | null
  /** Confirms the last library change. */
  libraryNotice: string | null
  /** Says why the last library change failed. */
  libraryError: string | null
  deleteActivity: (id: string) => void
  /**
   * The signed-in account's data as a JSON file, built from the server by the worker. Rejects with
   * the reason when it cannot be made. An export does not make the page busy.
   */
  exportData: () => Promise<Blob>
  /** The run splits of one held activity; null when it has none. Does not make the page busy. */
  activitySplits: (id: string) => Promise<DigestSplits | null>
  loadTrace: (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply>
  rebuildNotice: string | null
  rebuildSavedActivities: () => void
  /** Takes off the labels the last import applied from its export's list. */
  undoLabels: () => void
  addFiles: (files: File[]) => void
  loadSample: () => void
  setRange: (choice: PeriodChoice, answered?: (reply: WorkerResponse | null) => void) => void
  clear: () => void
  /**
   * The route of a saved activity, by its library id. `fromOriginal` reads the kept original file,
   * which is done only when the visitor asks. A read never shows an error or makes the page busy.
   */
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>
}
