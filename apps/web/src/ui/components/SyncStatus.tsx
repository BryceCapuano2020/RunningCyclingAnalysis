import { formatCount } from '../format/count'
import { useState } from 'react'
import { MAX_ACTIVITIES_PER_USER, MAX_FILE_BYTES } from '@rca/contract'
import type { SyncIssue } from '@rca/core/session'
import { MOVED_NOTE } from '../analysis/copy'
import { megabytes } from '../format/units'
import { resetSentence } from '../limitCopy'
import { plural } from './plural'
import { hasRetryableIssue } from '../useSaveRetry'
import './SyncStatus.css'

export interface SyncStatusProps {
  /** Activities saved so far in the current import, or null when no upload is running. */
  uploading: number | null
  /**
   * What the import that just ended saved, as the worker counted it. It is exact; `uploading` is the
   * last count drawn, which can lag, so the finished sentence prefers this one.
   */
  savedCount?: number | null
  /** Activities in this library session that were not saved, or not kept, and why. */
  issues: SyncIssue[]
  signedIn: boolean
  /** The import's summary lists what moved in the athlete's numbers, so the completion says so. */
  moved?: boolean
  /**
   * Stored copies of workouts that the analysis hides. The library's cap counts every stored row, so a full library
   * says how many of its rows these are.
   */
  hiddenCopies?: number
  /**
   * Sends the saves that failed again now. The failures it can clear (the connection, the server) show a
   * "Try again now" button; the rest wait on something the athlete does.
   */
  onRetry?: (control: Element) => void
}

const MAX_FILE_MB = megabytes(MAX_FILE_BYTES)
const NOTHING_SAVED = 'No new activities were saved to your library.'

/**
 * What an import that stopped at a limit got done: the activities it saved, when known, and those
 * it left waiting. The saved count is the latest import's, so it goes only with that import's own
 * waiting; a limit an earlier import reached shows the session's count alone.
 */
function stoppedCounts({ count, latest }: SyncIssue, saved: number | null): string {
  if (latest === 0) return `${formatCount(count)} waiting.`
  const waiting = `${formatCount(latest ?? count)} waiting.`
  return saved === null ? waiting : `${formatCount(saved)} saved, ${waiting}`
}

/** The rows of a full library that are copies of a workout held in another file (the wording of hiddenCopiesText). */
function copiesNote(hiddenCopies: number): string {
  return hiddenCopies > 0
    ? `, ${formatCount(hiddenCopies)} of them ${hiddenCopies === 1 ? 'a copy' : 'copies'} of the same workout from another file`
    : ''
}

/**
 * One sentence per cause: what happened, and the action that works. A summary is saved before its
 * original is uploaded, so the failures that can hit either step say 'not fully saved'. A limit
 * stops the import, so its sentence counts what was saved and what is waiting instead.
 */
function issueSentence(
  issue: SyncIssue,
  saved: number | null,
  hiddenCopies: number,
  canRetry: boolean,
): string {
  const { code, count } = issue
  const activities = plural(count, 'activity', 'activities')
  const originals = plural(count, 'original')
  const wereOrWas = count === 1 ? 'was' : 'were'
  const them = count === 1 ? 'it' : 'them'
  const summaries = count === 1 ? 'The summary was saved.' : 'The summaries were saved.'
  switch (code) {
    case 'signed-out':
      return `${activities} ${wereOrWas} not saved because you were signed out. Sign in and add ${them} again.`
    case 'account-changed':
      return `Your account changed in another tab, so ${activities} ${wereOrWas} not saved. Reload this page.`
    case 'activity-quota':
      return `Your library is full (${formatCount(MAX_ACTIVITIES_PER_USER)} activities${copiesNote(hiddenCopies)}). ${stoppedCounts(issue, saved)} Delete older activities to make room, then add the rest again.`
    case 'storage-quota':
      return `Your original-file storage is full, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'storage-budget':
      return `Original-file storage is paused for now, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'file-too-large':
      return `${originals} ${wereOrWas} too large to keep (over ${MAX_FILE_MB} MB). ${summaries}`
    case 'rate-limited':
      return `Too many requests at once. ${stoppedCounts(issue, saved)} Wait a minute, then add the rest again.`
    case 'daily-limit':
      return `You have reached today's limit on saves. ${stoppedCounts(issue, saved)} ${resetSentence()} Add the rest again after that.`
    case 'upload-in-progress':
      return `Another original-file upload is still in progress, so ${activities} ${wereOrWas} not fully saved. Wait for it to finish, then add ${them} again.`
    case 'account-deleting':
      return `This account is being deleted, so ${activities} ${wereOrWas} not saved. Account deletion must finish before you can sign in again.`
    case 'digest-quota':
      return 'Your saved analyses have reached the storage limit. Delete some saved activities to save more.'
    case 'database-full':
      return 'Saving is paused because the service is near its storage capacity. Your analysis still works on this device.'
    case 'activity-conflict':
      return count === 1
        ? 'This workout is already saved from a different file. Delete the saved copy first to replace it.'
        : `${formatCount(count)} workouts are already saved from different files. Delete the saved copies first to replace them.`
    case 'originals-off':
      return `Original files are turned off in your profile, so ${originals} ${wereOrWas} not kept. ${summaries} Turn on Keep original files in my library on Profile to keep them.`
    case 'network':
      return `${activities} ${wereOrWas} not fully saved because the connection dropped. ${count === 1 ? 'It saves' : 'They save'} when the connection returns${canRetry ? ', or when you press Try again now' : ''}.`
    case 'server':
      return `${activities} ${wereOrWas} not fully saved because of a server error. ${count === 1 ? 'It saves' : 'They save'} the next time the page loads${canRetry ? ', or when you press Try again now' : ''}.`
  }
}

/**
 * Status line for save outcomes. Render it once, inside the notice region (AppNotices), which is a live
 * region that stays mounted: a region that mounts with its content is not announced, but a line added to
 * one that is already there is. It says how an upload ends, once it finishes: the count saved, or that
 * none was. Starts are not announced here, and the running count is visual only, shown once at least one
 * activity is saved. Issues stay visible until the parent clears them.
 */
export function SyncStatus({
  uploading,
  savedCount = null,
  issues,
  signedIn,
  moved = false,
  hiddenCopies = 0,
  onRetry,
}: SyncStatusProps) {
  const [previous, setPrevious] = useState(uploading)
  // The completion keeps whether its import moved the numbers, so the note outlives the list.
  const [finished, setFinished] = useState<{ saved: number; moved: boolean } | null>(null)

  // Detect the start and the finish of an upload during render, not in an effect.
  if (uploading !== previous) {
    setPrevious(uploading)
    if (uploading !== null && previous === null) {
      setFinished(null)
    } else if (uploading === null && previous !== null) {
      setFinished({ saved: savedCount ?? previous, moved })
    }
  }

  let text: string
  if (issues.length > 0) {
    text = issues
      .map((issue) =>
        issueSentence(issue, finished?.saved ?? null, hiddenCopies, onRetry !== undefined),
      )
      .join(' ')
  } else if (finished?.saved === 0) {
    text = NOTHING_SAVED
  } else if (finished !== null) {
    const saved = `Saved ${plural(finished.saved, 'activity', 'activities')} to your library.`
    text = finished.moved ? `${saved} ${MOVED_NOTE}` : saved
  } else {
    text = ''
  }
  const messageClass =
    issues.length > 0 ? 'sync-status__message sync-status__message--failed' : 'sync-status__message'
  const showCount = signedIn && uploading !== null && uploading > 0
  if (text === '' && !showCount) return null

  return (
    <div className="sync-status">
      {text !== '' && <p className={messageClass}>{text}</p>}
      {signedIn && onRetry !== undefined && hasRetryableIssue(issues) && (
        <button
          type="button"
          className="btn sync-status__retry"
          onClick={(event) => onRetry(event.currentTarget)}
        >
          Try again now
        </button>
      )}
      {showCount && (
        <span className="sync-status__count" aria-hidden="true">
          {`${formatCount(uploading ?? 0)} saved`}
        </span>
      )}
    </div>
  )
}
