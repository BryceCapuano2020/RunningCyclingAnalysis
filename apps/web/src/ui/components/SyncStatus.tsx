import { formatCount } from '../format/count'
import { useState } from 'react'
import { MAX_ACTIVITIES_PER_USER, MAX_FILE_BYTES } from '@rca/contract'
import type { SyncIssue } from '@rca/core/session'
import { MOVED_NOTE } from '../analysis/copy'
import { megabytes } from '../format/units'
import { resetSentence } from '../limitCopy'
import { plural } from './plural'
import './SyncStatus.css'

export interface SyncStatusProps {
  /** Activities saved so far in the current import, or null when no upload is running. */
  uploading: number | null
  /** Activities in this library session that were not saved, or not kept, and why. */
  issues: SyncIssue[]
  signedIn: boolean
  /** The import's summary lists what moved in the athlete's numbers, so the completion says so. */
  moved?: boolean
}

const MAX_FILE_MB = megabytes(MAX_FILE_BYTES)
const NOTHING_SAVED = 'No new activities were saved to your library.'

/**
 * One sentence per cause: what happened, and the action that works. A summary is saved before its
 * original is uploaded, so the failures that can hit either step say 'not fully saved'.
 */
function issueSentence({ code, count }: SyncIssue): string {
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
      return `Your library is full (${formatCount(MAX_ACTIVITIES_PER_USER)} activities), so ${activities} ${wereOrWas} not saved. Delete older activities to make room.`
    case 'storage-quota':
      return `Your original-file storage is full, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'storage-budget':
      return `Original-file storage is paused for now, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'file-too-large':
      return `${originals} ${wereOrWas} too large to keep (over ${MAX_FILE_MB} MB). ${summaries}`
    case 'rate-limited':
      return `Too many requests at once, so ${activities} ${wereOrWas} not fully saved. Wait a minute, then add ${them} again.`
    case 'daily-limit':
      return `You have reached today's limit on saves, so ${activities} ${wereOrWas} not fully saved. ${resetSentence()} Add ${them} again after that.`
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
    case 'network':
      return `${activities} ${wereOrWas} not fully saved because the connection dropped. Add ${them} again to retry.`
    case 'server':
      return `${activities} ${wereOrWas} not fully saved because of a server error. Add ${them} again to retry.`
  }
}

/**
 * Status line for save outcomes. Render it once, outside the pages, so its
 * live region stays mounted: a region that mounts with the content is not announced. It announces
 * how an upload ends, once it finishes: the count saved, or that none was. Starts are not announced
 * here, and the running count is visual only, shown once at least one activity is saved. Issues
 * stay visible until the parent clears them.
 */
export function SyncStatus({ uploading, issues, signedIn, moved = false }: SyncStatusProps) {
  const [previous, setPrevious] = useState(uploading)
  // The completion keeps whether its import moved the numbers, so the note outlives the list.
  const [finished, setFinished] = useState<{ saved: number; moved: boolean } | null>(null)

  // Detect the start and the finish of an upload during render, not in an effect.
  if (uploading !== previous) {
    setPrevious(uploading)
    if (uploading !== null && previous === null) {
      setFinished(null)
    } else if (uploading === null && previous !== null) {
      setFinished({ saved: previous, moved })
    }
  }

  let text: string
  if (issues.length > 0) {
    text = issues.map(issueSentence).join(' ')
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

  return (
    <div className="sync-status">
      <p role="status" className={messageClass}>
        {text}
      </p>
      {signedIn && uploading !== null && uploading > 0 && (
        <span className="sync-status__count" aria-hidden="true">
          {`${formatCount(uploading)} saved`}
        </span>
      )}
    </div>
  )
}
