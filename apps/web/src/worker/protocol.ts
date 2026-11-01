import type { Profile } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import type { PeriodChoice } from '@rca/core/period'
import type { Copy, RejectedFile, SessionState, SyncIssueCode } from '@rca/core/session'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { AthleteSettings, DigestSplits } from '@rca/core/types'
import type { ExportAccount } from '../export/accountExport'
import type { ActivityTraceReply } from './workbench'
import type { CheckInView, SeenEvent, SeenRow } from './checkinKeeper'
import type { UpdateStop } from './updaterConfig'
export type { ActivityTraceReply } from './workbench'
export type { CheckInView, SeenEvent, SeenRow } from './checkinKeeper'

export interface SavedActivity {
  id: string
  name: string
  startMs: number
  sport: 'run' | 'ride'
  /** This copy as the analysis ranks copies of one workout, so the richest saved copy can be told apart. */
  copy: Copy
}

/**
 * What the worker found this browser failed to do with the activities it keeps. `notSaved` counts
 * activities of one import that show but were not kept, and `newer` those it left because a newer
 * version of the app keeps a copy that this one cannot read; `notForgotten` is a delete or removal that
 * left a copy behind; `notRead` is an import analysed without the library kept in this browser, because that
 * could not be read; `replaced` is an import that stopped because the library kept in this browser was emptied, in
 * this tab or another, while it ran. The page sets `unread` on a `notSaved` that follows a `notRead`, so both are said.
 */
export type WorkerDeviceIssue =
  | { issue: 'notSaved'; count: number; newer?: number; unread?: true }
  | { issue: 'notForgotten' }
  | { issue: 'notRead' }
  | { issue: 'replaced' }

/**
 * What the page says about the activities kept in this browser: the worker's findings, and two the page
 * finds itself. `evicted`: results were kept on an earlier visit and the browser no longer holds them.
 * `mayBeCleared`: the browser would not promise to keep them (see storagePersistence).
 */
export type DeviceIssue = WorkerDeviceIssue | { issue: 'evicted' } | { issue: 'mayBeCleared' }

export interface ImportOutcome {
  /** The activities the import read, which a file may hold several of. */
  activities: number
  /**
   * The files with an activity the library now holds and shows, which is not every file that was read:
   * a file whose workouts were all held, or hidden as copies, is in `duplicates`, and a refused one in
   * `rejected`. It is zero exactly when the import added no run or ride. Absent from outcomes that do
   * not count them.
   */
  filesAdded?: number
  rejected: number
  /**
   * Activity files an export's own list does not name, such as Strava's saved routes. They are left
   * unread, and are not in `rejected`. Absent from outcomes that do not count them.
   */
  notActivities?: number
  /**
   * The activity files in a format the app does not read, by extension (such as pwx), which are counted in
   * `rejected` and named here. Absent when there were none.
   */
  skippedTypes?: Record<string, number>
  /**
   * When an activities.csv came with the files: how many files the list names and how many of them were given.
   * Absent when there was none, or it named nothing.
   */
  listed?: { named: number; received: number }
  /** A loose file was refused for want of a sport, and no list came with it to give one. Absent otherwise. */
  needsList?: true
  /** Files whose every activity is a workout the library already holds or shows as a copy: a copy, or the file added again. */
  duplicates: RejectedFile[]
  /** Runs and rides the import added to the library. Absent from outcomes that do not count them. */
  runs?: number
  rides?: number
  /**
   * Runs and rides the import brought up to date: workouts the library held from an older model, replaced by a
   * fresh copy. They are not new, so they are never counted in `runs` and `rides`, and never move the numbers.
   */
  updatedRuns?: number
  updatedRides?: number
  /** The earliest and latest start, in epoch ms, of the activities the import added. */
  firstStartMs?: number
  lastStartMs?: number
  /**
   * Activities the library already held whose detailed readings this import brought back, because
   * their file was added again. Absent when none were. Never counts an activity the import added.
   */
  detailRestored?: number
  /**
   * Saved activities the import's list labelled (Hike, Walk, a ski or another type), now left out of the analysis. Absent
   * when none were.
   */
  labelled?: number
  /** Activities whose file says one sport and whose export's list names the other: the file wins. Absent when none. */
  listedAsOtherSport?: number
}

/** Whether imported activities are saved to the signed-in account, and whether their files are kept. */
export interface SyncOptions {
  userId: string
  keepFiles: boolean
  /** The athlete's choice to send the titles of their activities to the account; see api/uploadPolicy.ts. */
  uploadTitles?: boolean
}

/**
 * The period a library or sample load starts on: the one the page will show. Without it the session
 * keeps the one it has, which is the default for a new session, so a period stored on the device
 * would cost a second analysis.
 */
export interface LoadPeriod {
  choice?: PeriodChoice
}

export type WorkerRequest =
  /**
   * `sync` saves to the signed-in account. Without it, `saveToDevice` keeps the digests in this
   * browser, so a signed-out visitor's results survive a reload.
   */
  | {
      type: 'addFiles'
      files: File[]
      settings: AthleteSettings
      sync: SyncOptions | null
      saveToDevice?: boolean
      /** Analysed while the account loads: the page does not summarise the answer as an import result. */
      provisional?: boolean
    }
  /**
   * Loads the digests kept in this browser, unless the session already holds them or a sample is
   * showing.
   */
  /** `reload` reads the library again even when this tab holds it, because another tab changed it. */
  | ({ type: 'loadDevice'; settings: AthleteSettings; reload?: boolean } & LoadPeriod)
  | ({ type: 'loadSample'; settings: AthleteSettings } & LoadPeriod)
  | ({
      type: 'loadServer'
      settings: AthleteSettings
      userId: string
      uploadTitles?: boolean
    } & LoadPeriod)
  | { type: 'rebuildStale'; settings: AthleteSettings; userId: string; uploadTitles?: boolean }
  /** Takes off the labels the last import applied from its export's list (its summary's Undo); a null `userId` is the library kept in this browser. */
  | { type: 'undoLabels'; settings: AthleteSettings; userId: string | null }
  | { type: 'setSettings'; settings: AthleteSettings }
  | { type: 'setRange'; choice: PeriodChoice; settings: AthleteSettings }
  /** `forgetDevice` also empties the library kept in this browser. */
  | { type: 'clear'; forgetDevice?: boolean }
  | { type: 'deleteActivity'; id: string; userId: string; settings: AthleteSettings }
  /**
   * Keeps in this browser the activities that provisional imports analysed, without reading their files
   * again. Sent when the account turns out to be nobody's.
   */
  | { type: 'keepProvisional'; settings: AthleteSettings }
  /** Removes one workout from the library kept in this browser; `id` is a SavedActivity id. */
  | { type: 'deleteDeviceActivity'; id: string; settings: AthleteSettings }
  /** Builds the account's data export from its library. The account, profile and dated settings come from the page. */
  | {
      type: 'exportData'
      userId: string
      account: ExportAccount
      profile: Profile
      measurements?: Measurement[]
    }
  /** The run splits of one held activity, which the activity page asks for; answered by `splits`. */
  | { type: 'activitySplits'; id: string }
  /**
   * The route of one saved activity, by its library id. With `userId` the account's copy is used,
   * otherwise the one kept in this browser. The original file is read only with `fromOriginal`.
   * Answered with `routeShape`.
   */
  | { type: 'routeShape'; id: string; userId?: string; fromOriginal?: boolean }
  /** The session ended without a sign-out: the route shapes this tab holds for it are forgotten. */
  | { type: 'forgetRoutes' }
  /**
   * Adds the activities kept in this browser from before sign-in to the account, then reads the library again.
   * Sends `adoption` before its state.
   */
  | { type: 'adoptDevice'; userId: string; settings: AthleteSettings; uploadTitles?: boolean }
  /** Empties the library kept in this browser while the account is on screen, which stays as it is. */
  | { type: 'forgetDeviceLibrary'; settings: AthleteSettings }
  /** A detail trace for an exact core activity id. Originals are read only on explicit request. */
  | { type: 'activityTrace'; id: string; userId?: string; fromOriginal?: boolean }
  /** A row of "your years" or "since your last import" was opened, hidden or shown. Answered with `checkInSaved`. */
  | { type: 'markSeen'; row: SeenRow; event: SeenEvent }
  /** The athlete chose to go on with an import that stopped short: its snapshot becomes the baseline now. */
  | { type: 'acceptPartialImport' }

/**
 * A request as it travels to the worker: the request and the page's number for it. The worker stamps
 * the number on its reply (`replyTo`) and on every other message it sends while it runs the request
 * (`during`), so the page matches a reply to its request by number, never by arrival order. The number
 * is `requestId` because several requests already have an `id` of their own (an activity's).
 */
export type WireRequest = WorkerRequest & { requestId: number }

/** What the worker adds to a message: `replyTo` on a reply, `during` on an event. Both are absent when the request had no number. */
export interface WireStamp {
  replyTo?: number
  during?: number
}

/** The messages that answer a request, one per request. Every other message is an event. */
export const REPLY_TYPES: ReadonlySet<WorkerResponse['type']> = new Set<WorkerResponse['type']>([
  'state',
  'error',
  'exportReady',
  'splits',
  'routeShape',
  'activityTrace',
  'rebuildComplete',
  'checkInSaved',
])

export type WorkerResponse =
  /**
   * What a signed-in visit can do with the activities this browser kept before sign-in (see adoption.ts), sent apart
   * from any request when the account's library has loaded and again when it changes.
   */
  | { type: 'deviceOffer'; adoptable: number; again: number; held: number }
  /** How adding those activities to the account ended. Sent before the state that ends the request. */
  | {
      type: 'adoption'
      saved: number
      conflicts: number
      failed: number
      again: number
      held: number
    }
  /**
   * How the saves an earlier visit left in the outbox are going, sent apart from any request. `finished` ends
   * it: `saved` were saved, `failed` could not be and will not be tried again, `pending` were left for another load.
   */
  | { type: 'outbox'; pending: number; saved: number; failed: number; finished: boolean }
  /** Sent when the worker begins a request, so a request waiting its turn is not timed as if it ran. */
  | { type: 'started' }
  /**
   * Sent every couple of seconds while a request runs. `progress` counts units of real work (files read,
   * activities saved), so a count that does not move is a worker that is not getting anywhere.
   */
  | { type: 'heartbeat'; progress: number }
  /**
   * `filesTotal` is the activity files the request holds, when that is known before they are read.
   * `paused` is set while a rate limit holds the saves back; the next progress message ends it.
   */
  | {
      type: 'progress'
      filesRead: number
      filesTotal?: number
      uploaded?: number
      paused?: true
    }
  /**
   * The activities whose detailed readings this browser holds, and when the oldest of them started. Sent
   * before the state that ends a request that can change what is stored, and not again while it is the
   * same. Null ids say storage could not answer. Absent while a sample shows.
   */
  | { type: 'detailCoverage'; ids: string[] | null; oldestStartMs: number | null }
  /** Answers `markSeen` and `acceptPartialImport`: whether the check-in row is seen for its baseline. */
  | { type: 'checkInSaved'; seen: boolean }
  /** Saved activities without an original file. Sent before the state that ends the request. */
  | { type: 'missingOriginals'; count: number }
  /**
   * The account's saved activities when signed in, or the ones kept in this browser when not. For this browser's
   * library `skipped` counts the rows it keeps but could not read (a newer version's), so a list of none with
   * some skipped is not an empty library.
   */
  | { type: 'libraryActivities'; activities: SavedActivity[]; skipped?: number }
  /** Whether the library kept in this browser holds anything, after a removal that is not shown as a list. */
  | { type: 'deviceHolds'; holds: boolean }
  /** The account's export, as the JSON file to save. */
  | { type: 'exportReady'; file: Blob }
  /** The splits of the activity asked for, or null when it is not held or its digest has none. */
  | { type: 'splits'; id: string; splits: DigestSplits | null }
  /**
   * The route asked for, or null when it has none. `original` is true when the route is in the
   * account's original file and was not read, because the request did not ask for it.
   */
  | { type: 'routeShape'; route: RouteShape | null; original: boolean }
  | { type: 'activityTrace'; reply: ActivityTraceReply }
  /** Stored activities that could not be read in the last library load, sent when above zero. */
  | { type: 'libraryUnreadable'; count: number }
  /** The library kept in this browser did not take a save or a removal. Sent before the state that ends the request. */
  | ({ type: 'deviceIssue' } & WorkerDeviceIssue)
  /**
   * The import stopped saving: the account ended or changed, storage is full, or a limit was
   * reached. Sent before its state.
   */
  | { type: 'accountIssue'; issue: SyncIssueCode }
  /**
   * `saved` is the activities an import saved to the account, counted by the worker, so the page
   * ends on the right number however its progress messages were drawn. Absent when nothing is saved.
   * `outdatedWithOriginal`, absent when zero, is how many of the outdated saved activities in `state` still have an
   * original file to rebuild from, sent with the state so the two counts always agree. `checkIn` is "since your last
   * import" for the library on screen and whether it has been seen, sent with the state it was made against; absent
   * when there is none (no baseline, the sample, files kept nowhere).
   */
  | {
      type: 'state'
      state: SessionState
      outcome?: ImportOutcome
      saved?: number
      outdatedWithOriginal?: number
      /** After an Undo: how many of the import's labels could not be taken off and are still applied. Absent when none. */
      labelsLeft?: number
      checkIn?: CheckInView
    }
  | {
      type: 'rebuildComplete'
      state: SessionState
      checkIn?: CheckInView
      /** Absent when zero. As on `state`: the outdated activities in `state` that a rebuild can update. */
      outdatedWithOriginal?: number
      rebuilt: number
      missing: number
      failed: number
      /** Stale activities skipped at a daily or rate limit; try again after the limit resets. */
      limited: number
      /** Which limit stopped the rebuild: the daily download limit wins over a plain rate limit. */
      limitKind: 'daily' | 'rate' | null
      /** When the limit resets, in epoch ms; null when no limit was reached. */
      limitResetsAtMs: number | null
      /** Why the update ended before it had tried every activity, besides a limit. Absent when it did not. */
      stopped?: UpdateStop
    }
  /** `issue` is set when the failure means the account ended or changed, so the app can act on it. */
  | { type: 'error'; message: string; issue?: SyncIssueCode }
