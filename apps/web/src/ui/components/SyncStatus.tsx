import { useState } from 'react'
import { MAX_ACTIVITIES_PER_USER, MAX_FILE_BYTES } from '@rca/contract'
import type { SyncIssue } from '@rca/core/session'
import { plural } from './plural'
import './SyncStatus.css'

export interface SyncStatusProps {
  /** Activities saved so far in the current import, or null when no upload is running. */
  uploading: number | null
  /** Activities in this library session that were not saved, or not kept, and why. */
  issues: SyncIssue[]
  signedIn: boolean
}

const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

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
      return `${activities} ${wereOrWas} not saved because you were signed out. Sign in and re-import ${them}.`
    case 'account-changed':
      return `Your account changed in another tab, so ${activities} ${wereOrWas} not saved. Reload this page.`
    case 'activity-quota':
      return `Your library is full (${MAX_ACTIVITIES_PER_USER.toLocaleString('en-US')} activities), so ${activities} ${wereOrWas} not saved. Delete older activities to make room.`
    case 'storage-quota':
      return `Your original-file storage is full, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'storage-budget':
      return `Original-file storage is paused for now, so ${originals} ${wereOrWas} not kept. ${summaries}`
    case 'file-too-large':
      return `${originals} ${wereOrWas} too large to keep (over ${MAX_FILE_MB} MB). ${summaries}`
    case 'rate-limited':
      return `Too many requests at once, so ${activities} ${wereOrWas} not fully saved. Wait a minute, then re-import ${them}.`
    case 'network':
      return `${activities} ${wereOrWas} not fully saved because the connection dropped. Re-import ${them} to retry.`
    case 'server':
      return `${activities} ${wereOrWas} not fully saved because of a server error. Re-import ${them} to retry.`
  }
}

/**
 * Status line for save outcomes. Render it once, outside the landing and results views, so its
 * live region stays mounted: a region that mounts with the content is not announced. It announces
 * only the outcome of an upload, once it finishes. Starts are not announced here, and the running
 * count is visual only. Issues stay visible until the parent clears them.
 */
export function SyncStatus({ uploading, issues, signedIn }: SyncStatusProps) {
  const [previous, setPrevious] = useState(uploading)
  const [finished, setFinished] = useState<number | null>(null)

  // Detect the start and the finish of an upload during render, not in an effect.
  if (uploading !== previous) {
    setPrevious(uploading)
    if (uploading !== null && previous === null) {
      setFinished(null)
    } else if (uploading === null && previous !== null) {
      setFinished(previous)
    }
  }

  let text: string
  if (issues.length > 0) {
    text = issues.map(issueSentence).join(' ')
  } else if (finished !== null) {
    text = `Saved ${plural(finished, 'activity', 'activities')} to your library`
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
      {signedIn && uploading !== null && (
        <span className="sync-status__count" aria-hidden="true">
          {`${uploading} saved`}
        </span>
      )}
    </div>
  )
}
