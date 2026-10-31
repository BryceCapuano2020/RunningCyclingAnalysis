import { formatCount } from '../format/count'
import { DAILY_LIMITS } from '@rca/contract'
import type { DeviceIssue, SavedActivity, WorkerResponse } from '../../worker/protocol'
import { limitReached, listingLimitReached, resetSentence } from '../limitCopy'
import type { AccountStatus } from '../useAccount'
import { formatDay, formatDayMonth, formatMonth } from '../format/date'
import type { ImportSummary } from '../../worker/importSummary'
import type { ImportOutcome } from '../../worker/protocol'
import { plural } from '../components/plural'

/** Shown while held files wait for the kept library, for a signed-in or a signed-out visitor. */
export const WAITING_FOR_LIBRARY = 'Checking your saved results…'
export const WAITING_FOR_ACCOUNT = 'Waiting for your account…'
/** Shown while a rate limit holds an import's saves back; they go on by themselves. */
export const SAVES_PAUSED = 'Too many saves at once. Saving resumes in about a minute.'
/** A delete asked for before the library it would change has loaded. Nothing is removed. */
export const LIBRARY_NOT_READY =
  'Your library is still loading, so nothing was deleted. Try again in a moment.'
export const DEVICE_NOT_LOADED =
  'Your kept results could not be loaded in this browser, so these files were not added. Add them again.'
export const LIBRARY_NOT_LOADED =
  'Your library is not loaded, so these files were not imported. Retry loading your library, then add them again.'
export const STOPPED = 'Analysis is stopped, so this did not run. Restart analysis, then try again.'
/** Said when the browser could not hand a request to the analysis, and nothing was started. */
export const NOT_SENT = 'These files could not be sent to the analysis. Add them again.'
/** Shown while a request has made no headway for a while, before anything is done about it. */
export const STALLED_LEAD = 'Analysis stopped responding.'
export const UNREADABLE_LEAD = 'Analysis sent something this browser could not read.'
export const STILL_WORKING = 'Still working. This is taking longer than usual.'
export const INTERRUPTED = 'Your import was interrupted. Add the files again.'
export const EXPORT_INTERRUPTED = 'The download was interrupted. Download your data again.'
export const ACCOUNT_CHANGED_BEFORE_IMPORT =
  'The account changed before this import started. Select the files again.'
export const PROFILE_NOT_CONFIRMED =
  'Could not confirm your saved account settings. Retry saving your settings, then add these files again; no activities were imported.'
export const SAMPLE_BLOCKED =
  'Sample data cannot replace your saved library. Add your own files, or sign out to try the sample.'
export const ORIGINALS_UNAVAILABLE =
  'Original files cannot be read right now. Add the original files again to update these activities; saved originals are not deleted.'
/** A profile change the server refused. The typed value stays, with this beside it. */
export const SAVE_FAILED = "Couldn't save. Try again."
/** The status words for a save, the same wherever a field saves on its own. */
export const SAVE_STATE_TEXT = {
  saving: 'Saving…',
  saved: 'Saved.',
  failed: SAVE_FAILED,
} as const
export const RETENTION_UNAVAILABLE =
  'Original file storage is unavailable right now. Your saved preference is preserved; new imports save summaries only and original files are not kept. Existing saved originals are not deleted.'
export const SIGN_IN_TO_EXPORT = 'Sign in to download your data.'
/** What an import reports for its summary: the files it read and could not use, and what it added. */
export type ImportCounts = Pick<
  ImportOutcome,
  'activities' | 'rejected' | 'detailRestored' | 'updatedRuns' | 'updatedRides'
> &
  ImportSummary & { duplicates?: readonly unknown[] }

/** Said after a summary's sentence when the list under it says what moved in the numbers. */
export const MOVED_NOTE = 'Your numbers moved.'
export const SPLITS_NOT_LOADED =
  'The splits could not be loaded. Open this activity again to retry.'
/**
 * The visitor's own Stop. It is neutral, not a fault: the results already kept stay, and nothing
 * claims that files which were partly read were not kept.
 */
export const STOPPED_BY_USER = "Stopped. Add your files again when you're ready."

/** An error reply from the worker. */
export type ErrorReply = Extract<WorkerResponse, { type: 'error' }>

/** What a saved-activity rebuild did, as the page words it. */
export type RebuildOutcome = Omit<
  Extract<WorkerResponse, { type: 'rebuildComplete' }>,
  'type' | 'state'
>

/** The sentence for saved activities a rebuild could not reach because of a limit. */
export function limitedSentence(
  count: number,
  kind: 'daily' | 'rate' | null,
  resetsAtMs: number | null,
): string {
  const noun = count === 1 ? 'activity was' : 'activities were'
  if (kind === 'rate') {
    return `${formatCount(count)} ${noun} not updated. The server asked us to slow down; try again in a minute.`
  }
  if (kind === 'daily') {
    return `${formatCount(count)} ${noun} not updated because today's limit on downloads (${formatCount(DAILY_LIMITS.fileDownload)} per day) was reached. ${resetSentence(resetsAtMs)}`
  }
  return `${formatCount(count)} ${noun} not updated. Try again later.`
}

/** The notice after a rebuild: what was rebuilt, and what was not, and why. */
export function rebuildNoticeText(outcome: RebuildOutcome): string {
  const notice = [
    `Updated ${formatCount(outcome.rebuilt)} saved ${outcome.rebuilt === 1 ? 'activity' : 'activities'}.`,
  ]
  if (outcome.missing > 0) {
    notice.push(
      `${formatCount(outcome.missing)} original ${outcome.missing === 1 ? 'file is' : 'files are'} missing or could not be matched; add ${outcome.missing === 1 ? 'that original file' : 'those original files'} again.`,
    )
  }
  if (outcome.failed > 0) {
    notice.push(
      `${formatCount(outcome.failed)} could not be updated; try again when the server is available.`,
    )
  }
  if (outcome.limited > 0) {
    notice.push(limitedSentence(outcome.limited, outcome.limitKind, outcome.limitResetsAtMs))
  }
  return notice.join(' ')
}

/**
 * The sentence for what an import added, such as "Added 412 runs and 388 rides, from Mar 2023 to
 * Oct.". Null when the import added no runs or rides, so the caller says something else.
 */
export function addedSentence(summary: ImportSummary, nowMs = Date.now()): string | null {
  const { runs = 0, rides = 0, firstStartMs, lastStartMs } = summary
  if (runs + rides === 0 || firstStartMs === undefined || lastStartMs === undefined) return null
  const counts = [
    runs > 0 ? plural(runs, 'run') : '',
    rides > 0 ? plural(rides, 'ride') : '',
  ].filter((text) => text !== '')
  // One activity has one day, so the sentence names that day rather than its month.
  if (runs + rides === 1) {
    return `Added ${counts.join(' and ')}, on ${formatDayMonth(firstStartMs, nowMs)}.`
  }
  // The year is shown on both ends when they fall in different years, or when either is not this year.
  const firstYear = new Date(firstStartMs).getFullYear()
  const withYear =
    firstYear !== new Date(lastStartMs).getFullYear() || firstYear !== new Date(nowMs).getFullYear()
  const first = formatMonth(firstStartMs, withYear)
  const last = formatMonth(lastStartMs, withYear)
  const span = first === last ? `in ${first}` : `from ${first} to ${last}`
  return `Added ${counts.join(' and ')}, ${span}.`
}

/**
 * The sentence for workouts the import brought up to date, such as "Updated 12 runs and 3 rides." They were in
 * the library already, held from an older model, so they are said apart from what was added. Null when none.
 */
export function updatedSentence({
  updatedRuns = 0,
  updatedRides = 0,
}: ImportCounts): string | null {
  if (updatedRuns + updatedRides === 0) return null
  const counts = [
    updatedRuns > 0 ? plural(updatedRuns, 'run') : '',
    updatedRides > 0 ? plural(updatedRides, 'ride') : '',
  ].filter((text) => text !== '')
  return `Updated ${counts.join(' and ')}.`
}

/** Every import's summary sentence: what it added and updated, or that nothing was new. Shown and announced alike. */
export function importSentence(summary: ImportCounts, nowMs = Date.now()): string {
  const said = [addedSentence(summary, nowMs), updatedSentence(summary)].filter(
    (text) => text !== null,
  )
  const sentence = said.length > 0 ? said.join(' ') : notAddedSentence(summary.activities)
  const { detailRestored = 0 } = summary
  return detailRestored > 0
    ? `${sentence} Detail restored for ${plural(detailRestored, 'activity', 'activities')}.`
    : sentence
}

/**
 * The line for an import that added no runs or rides, so every import says what it did. What it read
 * was already in the library, or it read nothing.
 */
export function notAddedSentence(activities: number): string {
  if (activities === 0) return 'No activities were analysed.'
  return `Nothing new: ${plural(activities, 'activity', 'activities')} already in your library.`
}

export function deleteFailureText(message: ErrorReply): string {
  return message.issue === 'daily-limit'
    ? limitReached('activityDelete')
    : `Could not delete the activity. ${message.message}`
}

export function deleteNoticeText(activity: SavedActivity | undefined): string {
  return activity
    ? `Deleted ${activity.name} (${formatDay(activity.startMs)}).`
    : 'Deleted the activity.'
}

export function exportFailureText(message: ErrorReply): string {
  return message.issue === 'daily-limit'
    ? listingLimitReached(message.message)
    : `Could not download your data. ${message.message}`
}

/**
 * The message for a worker that stopped on its own. The account state at that moment decides the
 * wording: a signed-in library is reloaded, or the user restarts analysis to reload it. A library
 * kept in this browser is reloaded the same way, so only the files being added need adding again.
 */
export function workerFailureText(
  status: AccountStatus,
  willRestart: boolean,
  eventMessage: string,
  lead = 'Analysis stopped unexpectedly.',
): string {
  if (status === 'signed-in') {
    return willRestart
      ? `${lead} Your saved library is reloading; add again any files that were not saved.`
      : `${lead} Restart analysis to reload your saved library; add again any files that were not saved.`
  }
  if (status === 'signed-out') {
    return willRestart
      ? `${lead} Your results kept in this browser are reloading; add again any files that were being added.`
      : `${lead} Restart analysis to reload your results kept in this browser; add again any files that were being added.`
  }
  return eventMessage || 'Analysis failed. Add again any files that were being added.'
}

/**
 * What this browser could not do with the activities it keeps. A signed-in visitor's deleted
 * activity is gone from the account, but its copy here could come back once they sign out; a
 * signed-out visitor can remove everything from Profile and try again.
 */
const NOT_READ_TEXT =
  'Your kept results could not be read from this browser just now, so these files are shown on their own and are not added to them. Reload the page to try again.'

export function deviceIssueText(notice: DeviceIssue, signedIn: boolean): string {
  const signIn = signedIn ? '' : ' Sign in to keep your results on your account.'
  if (notice.issue === 'evicted') {
    return `The results you kept in this browser are no longer in it. Clearing site data, low storage or, in Safari, a week away can remove them. Add your files again.${signIn}`
  }
  if (notice.issue === 'mayBeCleared') {
    return `Your results are kept in this browser only, and it has not agreed to hold them. Clearing site data, low storage or, in Safari, a week away can remove them.${signIn}`
  }
  if (notice.issue === 'notRead') return NOT_READ_TEXT
  if (notice.issue === 'replaced') {
    return 'The results kept in this browser were removed while this import ran, or this browser could not check them, so the import stopped and was not kept. Add the files again to start over.'
  }
  if (notice.issue === 'notSaved') {
    const one = notice.count === 1
    const refused =
      notice.count === 0
        ? ''
        : `${plural(notice.count, 'activity', 'activities')} ${one ? 'shows' : 'show'} here but could not be kept in this browser. ${one ? 'It' : 'They'} will not be here after a reload.`
    const newer = notice.newer ?? 0
    const unread = notice.unread === true ? `${NOT_READ_TEXT} ` : ''
    if (newer === 0) return `${unread}${refused}`
    const oneNewer = newer === 1
    const left = `${plural(newer, 'activity', 'activities')} ${oneNewer ? 'shows' : 'show'} here. This browser keeps ${oneNewer ? 'a copy of it' : 'copies of them'} saved by a newer version of this app, and ${oneNewer ? 'that copy was' : 'those copies were'} left as ${oneNewer ? 'it is' : 'they are'}. Reload the page to update the app.`
    return `${unread}${refused === '' ? left : `${refused} ${left}`}`
  }
  return signedIn
    ? 'This browser could not delete its copy of the activity or its recording. It may come back when you sign out.'
    : 'This browser could not delete its kept activities or recordings. Use Remove all my activities to try again.'
}
