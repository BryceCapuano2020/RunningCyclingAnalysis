import type { AnalysisController } from './controller'

/**
 * What each page reads of the analysis controller. A page takes its view, not the whole controller, so
 * adding a member to the controller touches only the views whose pages read it, and tsc stops a page
 * from reaching a member it does not name (views.types.ts shows it). The controller object itself is
 * passed (a view is a type, not a copy), so a page that memoises on it keeps its identity.
 */
type View<K extends keyof AnalysisController> = Pick<AnalysisController, K>

type CheckInKeys = 'state' | 'checkIn' | 'markCheckInSeen' | 'incompleteImport'
/** The line under Balance's title that says what moved since the last import. */
export type CheckInView = View<CheckInKeys>

type BalanceKeys = CheckInKeys | 'busy' | 'addFiles'
export type BalanceView = View<BalanceKeys>

type PeriodKeys = 'state' | 'busy' | 'setRange'
/** The period control on the result pages. */
export type PeriodView = View<PeriodKeys>

/** Balance, Run, Ride, Activities and History: the pages that need a result. */
export type ResultView = View<
  | BalanceKeys
  | PeriodKeys
  | 'savedActivities'
  | 'libraryAction'
  | 'detail'
  | 'deleteActivity'
  | 'libraryNotice'
  | 'libraryError'
  | 'activitySplits'
  | 'loadTrace'
  | 'loadRoute'
  | 'renameActivity'
>

type SavedLibraryKeys = 'savedActivities' | 'libraryUnreadable' | 'libraryStatus'
/** What Profile's saved-library card says of the library kept here or on the account. */
export type SavedLibraryView = View<SavedLibraryKeys>

export type ProfileView = View<SavedLibraryKeys | 'state' | 'busy' | 'missingOriginals'>

export type LandingView = View<'busy' | 'loadSample'>

type HeldInputKeys = 'state' | 'busy' | 'libraryUnreadable' | 'outdatedWithOriginal'
/** What decides the words and buttons of the page for a library held without results. */
export type HeldViewInput = View<HeldInputKeys>

export type HeldView = View<HeldInputKeys | 'rebuildSavedActivities'>

/** What picks which page the route shows: results, restoring, held, unavailable or the landing page. */
export type LibraryPageView = View<
  | 'state'
  | 'deviceIssue'
  | 'libraryStatus'
  | 'restoring'
  | 'savedActivities'
  | 'libraryUnreadable'
  | 'incompleteImport'
  | 'resultsWaiting'
  | 'resultsFailed'
>

type LibraryNoticeKeys =
  | 'state'
  | 'busy'
  | 'deviceIssue'
  | 'libraryStatus'
  | 'missingOriginals'
  | 'outdatedWithOriginal'
  | 'rebuildNotice'
  | 'rebuildSavedActivities'
export type LibraryNoticesView = View<LibraryNoticeKeys>

/** The notices above every page: import, library, device and fault. */
export type NoticesView = View<
  | LibraryNoticeKeys
  | 'error'
  | 'errorIssue'
  | 'errorNeutral'
  | 'workerStopped'
  | 'retryWorker'
  | 'retryLibrary'
  | 'libraryNotice'
  | 'libraryError'
  | 'detail'
  | 'savedActivities'
  | 'savedCount'
  | 'uploading'
  | 'outbox'
  | 'resumeSaves'
  | 'importOutcome'
  | 'dismissSummary'
  | 'undoLabels'
  | 'incompleteImport'
  | 'acceptIncompleteImport'
  | 'deviceOffer'
  | 'adoption'
  | 'adoptDevice'
  | 'forgetDeviceLibrary'
  | 'dismissAdoption'
>
