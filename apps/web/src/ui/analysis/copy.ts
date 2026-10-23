import { DAILY_LIMITS } from '@rca/contract'
import type { SavedActivity, WorkerResponse } from '../../worker/protocol'
import { limitReached, resetSentence } from '../limitCopy'
import type { AccountStatus } from '../useAccount'
import { formatDay } from '../format/date'

export const WAITING_FOR_LIBRARY = 'Waiting for your library to load'
export const LIBRARY_NOT_LOADED =
  'Your library is not loaded, so these files were not imported. Retry loading your library, then add them again.'
export const STOPPED = 'Analysis is stopped, so this did not run. Restart analysis, then try again.'
export const INTERRUPTED = 'Your import was interrupted. Add the files again.'
export const EXPORT_INTERRUPTED = 'The download was interrupted. Download your data again.'
export const ACCOUNT_CHANGED_BEFORE_IMPORT =
  'The account changed before this import started. Select the files again.'
export const PROFILE_NOT_CONFIRMED =
  'Could not confirm your saved account settings. Retry saving your settings, then re-import these files; no activities were imported.'
export const SAMPLE_BLOCKED =
  'Sample data cannot replace your saved library. Add your own files, or sign out to try the sample.'
export const ORIGINALS_UNAVAILABLE =
  'Saved originals cannot be accessed on this deployment. Import the original files to rebuild these activities; existing saved originals are not deleted.'
export const RETENTION_UNAVAILABLE =
  'Original file storage is unavailable on this deployment. Your saved preference is preserved; new imports save summaries only and original files stay on this device. Existing saved originals are not deleted.'
export const SIGN_IN_TO_EXPORT = 'Sign in to download your data.'

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
    return `${count} ${noun} not rebuilt. The server asked us to slow down; try again in a minute.`
  }
  if (kind === 'daily') {
    return `${count} ${noun} not rebuilt because today's limit on downloads (${DAILY_LIMITS.fileDownload} per day) was reached. ${resetSentence(resetsAtMs)}`
  }
  return `${count} ${noun} not rebuilt. Try again later.`
}

/** The notice after a rebuild: what was rebuilt, and what was not, and why. */
export function rebuildNoticeText(outcome: RebuildOutcome): string {
  const notice = [
    `Rebuilt ${outcome.rebuilt} saved ${outcome.rebuilt === 1 ? 'activity' : 'activities'}.`,
  ]
  if (outcome.missing > 0) {
    notice.push(
      `${outcome.missing} original ${outcome.missing === 1 ? 'file is' : 'files are'} missing or could not be matched; re-import those original files.`,
    )
  }
  if (outcome.failed > 0) {
    notice.push(`${outcome.failed} could not be rebuilt; try again when the server is available.`)
  }
  if (outcome.limited > 0) {
    notice.push(limitedSentence(outcome.limited, outcome.limitKind, outcome.limitResetsAtMs))
  }
  return notice.join(' ')
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
    ? limitReached('read')
    : `Could not download your data. ${message.message}`
}

/**
 * The message for a worker that stopped on its own. The account state at that moment decides the
 * wording: a signed-in library is reloaded, or the user restarts analysis to reload it.
 */
export function workerFailureText(
  status: AccountStatus,
  willRestart: boolean,
  eventMessage: string,
): string {
  if (status === 'signed-in') {
    return willRestart
      ? 'The analysis worker stopped. Your saved library is reloading; re-import any local files that were not saved.'
      : 'The analysis worker stopped. Restart analysis to reload your saved library; re-import any local files that were not saved.'
  }
  if (status === 'signed-out')
    return 'The analysis worker stopped. Re-import your files to continue.'
  return eventMessage || 'The analysis worker failed. Re-import your files to continue.'
}
