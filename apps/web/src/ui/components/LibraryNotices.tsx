import { useEffect, useRef, useState } from 'react'
import { deviceIssueText, ORIGINALS_UNAVAILABLE } from '../analysis/copy'
import { NoticeLine } from './NoticeLine'
import { plural } from './plural'
import type { AnalysisController } from '../useAnalysis'
import type { DeviceIssue } from '../../worker/protocol'

/**
 * 'requested': clicked, and not yet known to have started. 'started': running. 'finished': it has
 * ended, so focus moves to its outcome.
 */
type RebuildPhase = 'idle' | 'requested' | 'started' | 'finished'

/** Saved activities that are rebuilt from their stored original files. */
function updateText(count: number): string {
  const one = count === 1
  return (
    `${plural(count, 'saved activity', 'saved activities')} ${one ? 'needs' : 'need'} a quick ` +
    `update before ${one ? 'it counts' : 'they count'} in these results.`
  )
}

/** Outdated activities that have no original file to rebuild from, so their files are added again. */
function addFilesText(count: number, signedIn: boolean): string {
  const one = count === 1
  const what = signedIn
    ? plural(count, 'saved activity', 'saved activities')
    : `${plural(count, 'activity', 'activities')} kept in this browser`
  return (
    `${what} ${one ? 'was' : 'were'} analysed by an older version of the app. Add ` +
    `${one ? 'its file' : 'their files'} again to include ${one ? 'it' : 'them'}.`
  )
}

/**
 * Saved activities made by an older analysis model. Signed in, the ones with an original file are
 * rebuilt from it and the others have their files added again; a visitor who is not signed in has
 * them kept in this browser, and adds the files again.
 */
function outdatedText(rebuildable: number, needFiles: number): string {
  return [
    rebuildable > 0 && updateText(rebuildable),
    needFiles > 0 && addFilesText(needFiles, true),
  ]
    .filter(Boolean)
    .join(' ')
}

/** The notice in a few words, for its one line. The full sentence sits under Details. */
const SHORT = {
  missing: (count: number) =>
    `${plural(count, 'activity', 'activities')} missing the original file`,
  incompatible: (count: number) =>
    `${plural(count, 'saved activity', 'saved activities')} need a newer app`,
  device: (issue: DeviceIssue) => {
    if (issue.issue === 'evicted') return 'Your kept results were cleared'
    if (issue.issue === 'mayBeCleared') return 'This browser may clear your results'
    if (issue.issue === 'notRead' || (issue.issue === 'notSaved' && issue.unread === true)) {
      return 'Kept results could not be read'
    }
    return issue.issue === 'notSaved'
      ? 'Not kept in this browser'
      : 'Could not remove from this browser'
  },
  outdated: (rebuildable: number, needFiles: number) => {
    const count = rebuildable + needFiles
    const what = plural(count, 'saved activity', 'saved activities')
    return needFiles === 0
      ? `${what} ${count === 1 ? 'needs' : 'need'} an update`
      : `${what} ${count === 1 ? 'is' : 'are'} out of date`
  },
}

export interface LibraryNoticesProps {
  analysis: AnalysisController
  signedIn: boolean
  keepFiles: boolean
  fileRetentionAvailable: boolean
  /** The library page is on screen with the update and newer-app messages, so these notices leave them out. */
  panelShown?: boolean
  onRetry: () => void
}

/**
 * The library's status messages, each one line with its sentence under Details. They render only while
 * they hold text, inside the notice region (AppNotices), which is always mounted and announces them as
 * they are added.
 */
export function LibraryNotices({
  analysis,
  signedIn,
  keepFiles,
  fileRetentionAvailable,
  panelShown = false,
  onRetry,
}: LibraryNoticesProps) {
  const originalsMissing = analysis.missingOriginals
  const missingCount = plural(originalsMissing, 'activity', 'activities')
  const missingText =
    originalsMissing === 1
      ? `${missingCount} is missing its original file. Add its file again to restore the original.`
      : `${missingCount} are missing their original file. Add their files again to restore the originals.`
  const missingShown = signedIn && keepFiles && fileRetentionAvailable && originalsMissing > 0
  const outdatedCount = analysis.state.outdatedActivities
  const outdatedShown = outdatedCount > 0 && !panelShown
  // Update now rebuilds from stored originals, so it covers only the outdated activities that have one.
  const rebuildable = signedIn ? Math.min(analysis.outdatedWithOriginal, outdatedCount) : 0
  const incompatibleCount = analysis.state.incompatibleActivities
  const incompatibleShown = incompatibleCount > 0 && !panelShown
  const incompatibleText =
    `${plural(incompatibleCount, 'saved activity', 'saved activities')} ` +
    `${incompatibleCount === 1 ? 'was' : 'were'} made by a newer version of this app and ` +
    `${incompatibleCount === 1 ? 'is' : 'are'} left out. Reload the page to update the app.`

  // The rebuild button goes once nothing is outdated, so when a rebuild ends, focus moves to the
  // outcome of the rebuild, which is shown by then. A request the app refuses without starting a rebuild
  // must not leave a later import's end to move focus, so only a started rebuild counts. Focus
  // that the user has moved elsewhere is left alone.
  const [rebuildPhase, setRebuildPhase] = useState<RebuildPhase>('idle')
  // Detected during render, as SyncStatus detects an upload, so the effect only moves focus.
  if (rebuildPhase === 'requested') setRebuildPhase(analysis.busy ? 'started' : 'idle')
  else if (rebuildPhase === 'started' && !analysis.busy) setRebuildPhase('finished')
  const rebuildNoticeRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<HTMLButtonElement>(null)
  // The outcome may be shown a render after the rebuild ends, so the effect waits for it, and moves focus once.
  const focusMoved = useRef(false)
  const outcomeShown = Boolean(analysis.rebuildNotice)
  useEffect(() => {
    if (rebuildPhase !== 'finished') {
      focusMoved.current = false
      return
    }
    const outcome = rebuildNoticeRef.current
    if (!outcomeShown || outcome === null || focusMoved.current) return
    focusMoved.current = true
    const active = document.activeElement
    if (active === null || active === document.body || active === updateRef.current) outcome.focus()
  }, [rebuildPhase, outcomeShown])

  return (
    <>
      {signedIn && analysis.libraryStatus === 'failed' && (
        <section className="notice notice--critical" aria-label="Library">
          <p role="alert">Your library could not be loaded.</p>
          <button type="button" className="btn" onClick={onRetry}>
            Retry
          </button>
        </section>
      )}
      {analysis.deviceIssue && (
        <section className="notice" aria-label="Browser storage problem">
          <NoticeLine short={SHORT.device(analysis.deviceIssue)}>
            {deviceIssueText(analysis.deviceIssue, signedIn)}
          </NoticeLine>
        </section>
      )}
      {missingShown && (
        <section className="notice" aria-label="Missing original files">
          <NoticeLine short={SHORT.missing(originalsMissing)}>{missingText}</NoticeLine>
        </section>
      )}
      {outdatedShown && (
        <section className="notice" aria-label="Saved activity updates">
          <NoticeLine
            short={SHORT.outdated(
              rebuildable,
              signedIn ? outdatedCount - rebuildable : outdatedCount,
            )}
          >
            {signedIn
              ? outdatedText(rebuildable, outdatedCount - rebuildable)
              : addFilesText(outdatedCount, false)}
            {rebuildable > 0 && !fileRetentionAvailable && (
              <>
                {' '}
                <span>{ORIGINALS_UNAVAILABLE}</span>
              </>
            )}
          </NoticeLine>
          {rebuildable > 0 && (
            <button
              ref={updateRef}
              type="button"
              className="btn"
              onClick={() => {
                // aria-disabled while busy, not disabled: a disabled button drops the focus it holds.
                if (analysis.busy) return
                setRebuildPhase('requested')
                analysis.rebuildSavedActivities()
              }}
              disabled={!fileRetentionAvailable}
              aria-disabled={analysis.busy}
            >
              {analysis.busy ? 'Updating…' : 'Update now'}
            </button>
          )}
        </section>
      )}
      {/* The outcome of a rebuild stays after the notice above unmounts, and takes focus when it is shown. */}
      {analysis.rebuildNotice && (
        <div ref={rebuildNoticeRef} tabIndex={-1}>
          {analysis.rebuildNotice}
        </div>
      )}
      {incompatibleShown && (
        <section className="notice" aria-label="Incompatible saved activities">
          <NoticeLine short={SHORT.incompatible(incompatibleCount)}>{incompatibleText}</NoticeLine>
        </section>
      )}
    </>
  )
}
