import type { Profile } from '@rca/contract'
import type { PeriodChoice } from '@rca/core/period'
import type { Copy, RejectedFile, SessionState, SyncIssueCode } from '@rca/core/session'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { AthleteSettings, DigestSplits } from '@rca/core/types'
import type { ExportAccount } from '../export/accountExport'

export interface SavedActivity {
  id: string
  name: string
  startMs: number
  sport: 'run' | 'ride'
  /** This copy as the analysis ranks copies of one workout, so the richest saved copy can be told apart. */
  copy: Copy
}

export interface ImportOutcome {
  activities: number
  rejected: number
  /**
   * Activity files an export's own list does not name, such as Strava's saved routes. They are left
   * unread, and are not in `rejected`. Absent from outcomes that do not count them.
   */
  notActivities?: number
  /** Files skipped because a better copy of the same workout is already saved. */
  duplicates: RejectedFile[]
  /** Runs and rides the import added to the library. Absent from outcomes that do not count them. */
  runs?: number
  rides?: number
  /** The earliest and latest start, in epoch ms, of the activities the import added. */
  firstStartMs?: number
  lastStartMs?: number
}

/** Whether imported activities are saved to the signed-in account, and whether their files are kept. */
export interface SyncOptions {
  userId: string
  keepFiles: boolean
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
  | ({ type: 'loadDevice'; settings: AthleteSettings } & LoadPeriod)
  | ({ type: 'loadSample'; settings: AthleteSettings } & LoadPeriod)
  | ({ type: 'loadServer'; settings: AthleteSettings; userId: string } & LoadPeriod)
  | { type: 'rebuildStale'; settings: AthleteSettings; userId: string }
  | { type: 'setSettings'; settings: AthleteSettings }
  /** Whether the headline trend carries running equivalents: only an age-graded Balance trend uses them. */
  | { type: 'setGradeTrend'; on: boolean; settings: AthleteSettings }
  | { type: 'setRange'; choice: PeriodChoice; settings: AthleteSettings }
  /** `forgetDevice` also empties the library kept in this browser. */
  | { type: 'clear'; forgetDevice?: boolean }
  | { type: 'deleteActivity'; id: string; userId: string; settings: AthleteSettings }
  /** Removes one workout from the library kept in this browser; `id` is a SavedActivity id. */
  | { type: 'deleteDeviceActivity'; id: string; settings: AthleteSettings }
  /** Builds the account's data export from its library. The account and profile come from the page. */
  | { type: 'exportData'; userId: string; account: ExportAccount; profile: Profile }
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

export type WorkerResponse =
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
  /** Saved activities without an original file. Sent before the state that ends the request. */
  | { type: 'missingOriginals'; count: number }
  /** The account's saved activities when signed in, or the ones kept in this browser when not. */
  | { type: 'libraryActivities'; activities: SavedActivity[] }
  /** The account's export, as the JSON file to save. */
  | { type: 'exportReady'; file: Blob }
  /** The splits of the activity asked for, or null when it is not held or its digest has none. */
  | { type: 'splits'; id: string; splits: DigestSplits | null }
  /**
   * The route asked for, or null when it has none. `original` is true when the route is in the
   * account's original file and was not read, because the request did not ask for it.
   */
  | { type: 'routeShape'; route: RouteShape | null; original: boolean }
  /** Stored activities that could not be read in the last library load, sent when above zero. */
  | { type: 'libraryUnreadable'; count: number }
  /**
   * The import stopped saving: the account ended or changed, storage is full, or a limit was
   * reached. Sent before its state.
   */
  | { type: 'accountIssue'; issue: SyncIssueCode }
  /**
   * `saved` is the activities an import saved to the account, counted by the worker, so the page
   * ends on the right number however its progress messages were drawn. Absent when nothing is saved.
   */
  | { type: 'state'; state: SessionState; outcome?: ImportOutcome; saved?: number }
  | {
      type: 'rebuildComplete'
      state: SessionState
      rebuilt: number
      missing: number
      failed: number
      /** Stale activities skipped at a daily or rate limit; try again after the limit resets. */
      limited: number
      /** Which limit stopped the rebuild: the daily download limit wins over a plain rate limit. */
      limitKind: 'daily' | 'rate' | null
      /** When the limit resets, in epoch ms; null when no limit was reached. */
      limitResetsAtMs: number | null
    }
  /** `issue` is set when the failure means the account ended or changed, so the app can act on it. */
  | { type: 'error'; message: string; issue?: SyncIssueCode }
