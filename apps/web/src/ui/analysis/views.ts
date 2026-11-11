import type { AnalysisController } from './controller'

/**
 * What each page reads of the analysis controller. A page takes its view, not the whole controller, so
 * adding a member to the controller touches only the views whose pages read it, and a page cannot reach
 * a member it does not name. The controller object itself is passed (a view is a type, not a copy), so
 * a page that memoises on it keeps its identity. views.test.ts checks each key list against the source
 * of the files that take the view: every member read is listed, and every member listed is read.
 */
type Keys = readonly (keyof AnalysisController)[]
type View<K extends Keys> = Pick<AnalysisController, K[number]>

export const CHECK_IN_KEYS = ['state', 'checkIn', 'markCheckInSeen', 'incompleteImport'] as const
/** The line under Balance's title that says what moved since the last import. */
export type CheckInView = View<typeof CHECK_IN_KEYS>

export const BALANCE_KEYS = [...CHECK_IN_KEYS, 'busy', 'addFiles'] as const
export type BalanceView = View<typeof BALANCE_KEYS>

export const PERIOD_KEYS = ['state', 'busy', 'setRange'] as const
/** The period control on the result pages. */
export type PeriodView = View<typeof PERIOD_KEYS>

/** Balance, Run, Ride, Activities and History: the pages that need a result. */
export const RESULT_KEYS = [
  ...BALANCE_KEYS,
  ...PERIOD_KEYS,
  'savedActivities',
  'libraryAction',
  'detail',
  'deleteActivity',
  'libraryNotice',
  'libraryError',
  'activitySplits',
  'loadTrace',
  'loadRoute',
  'renameActivity',
] as const
export type ResultView = View<typeof RESULT_KEYS>

export const SAVED_LIBRARY_KEYS = ['savedActivities', 'libraryUnreadable', 'libraryStatus'] as const
/** What Profile's saved-library card says of the library kept here or on the account. */
export type SavedLibraryView = View<typeof SAVED_LIBRARY_KEYS>

export const PROFILE_KEYS = [...SAVED_LIBRARY_KEYS, 'state', 'busy', 'missingOriginals'] as const
export type ProfileView = View<typeof PROFILE_KEYS>

export const LANDING_KEYS = ['busy', 'loadSample'] as const
export type LandingView = View<typeof LANDING_KEYS>

export const HELD_VIEW_KEYS = [
  'state',
  'busy',
  'libraryUnreadable',
  'outdatedWithOriginal',
] as const
/** What decides the words and buttons of the page for a library held without results. */
export type HeldViewInput = View<typeof HELD_VIEW_KEYS>

export const HELD_KEYS = [...HELD_VIEW_KEYS, 'rebuildSavedActivities'] as const
export type HeldView = View<typeof HELD_KEYS>

export const LIBRARY_PAGE_KEYS = [
  'state',
  'deviceIssue',
  'libraryStatus',
  'restoring',
  'savedActivities',
  'libraryUnreadable',
  'incompleteImport',
  'resultsWaiting',
  'resultsFailed',
] as const
/** What picks which page the route shows: results, restoring, held, unavailable or the landing page. */
export type LibraryPageView = View<typeof LIBRARY_PAGE_KEYS>

export const LIBRARY_NOTICE_KEYS = [
  'state',
  'busy',
  'deviceIssue',
  'libraryStatus',
  'missingOriginals',
  'outdatedWithOriginal',
  'rebuildNotice',
  'rebuildSavedActivities',
] as const
export type LibraryNoticesView = View<typeof LIBRARY_NOTICE_KEYS>

export const NOTICE_KEYS = [
  ...LIBRARY_NOTICE_KEYS,
  'error',
  'errorIssue',
  'errorNeutral',
  'workerStopped',
  'retryWorker',
  'retryLibrary',
  'libraryNotice',
  'libraryError',
  'detail',
  'savedActivities',
  'savedCount',
  'uploading',
  'outbox',
  'resumeSaves',
  'importOutcome',
  'dismissSummary',
  'undoLabels',
  'incompleteImport',
  'acceptIncompleteImport',
  'deviceOffer',
  'adoption',
  'adoptDevice',
  'forgetDeviceLibrary',
  'dismissAdoption',
] as const
/** The notices above every page: import, library, device and fault. */
export type NoticesView = View<typeof NOTICE_KEYS>
