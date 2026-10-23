import { useEffect, useRef, useState } from 'react'
import { ORIGINALS_UNAVAILABLE } from '../analysis/copy'
import { plural } from './plural'
import type { AnalysisController } from '../useAnalysis'

/**
 * 'requested': clicked, and not yet known to have started. 'started': running. 'finished': it has
 * ended, so focus moves to its outcome.
 */
type RebuildPhase = 'idle' | 'requested' | 'started' | 'finished'

/** Note for saved activities left out of the analysis because another file holds their workout. */
function hiddenCopiesText(count: number): string {
  const copies = count === 1 ? 'is a copy' : 'are copies'
  const counted = count === 1 ? 'is' : 'are'
  return (
    `${plural(count, 'saved activity', 'saved activities')} ${copies} of the same workout ` +
    `from another file and ${counted} not counted twice.`
  )
}

const LIBRARY_UNAVAILABLE =
  'Sign-in is unavailable right now. Your results are kept in this browser in the meantime.'

/**
 * Saved activities made by an older analysis model. Signed in, they are rebuilt from their files; a
 * visitor who is not signed in has them kept in this browser, and adds the files again.
 */
function outdatedText(count: number, signedIn: boolean): string {
  const one = count === 1
  if (!signedIn) {
    return (
      `${plural(count, 'activity', 'activities')} kept in this browser ${one ? 'was' : 'were'} ` +
      `analysed by an older version of the app. Add ${one ? 'its file' : 'their files'} again to ` +
      `include ${one ? 'it' : 'them'}.`
    )
  }
  return (
    `${plural(count, 'saved activity', 'saved activities')} ${one ? 'needs' : 'need'} a quick ` +
    `update before ${one ? 'it counts' : 'they count'} in these results.`
  )
}

export interface LibraryNoticesProps {
  analysis: AnalysisController
  signedIn: boolean
  keepFiles: boolean
  fileRetentionAvailable: boolean
  libraryUnavailable: boolean
  onRetry: () => void
}

/** The library's status messages. It stays mounted so that each message is announced when it appears. */
export function LibraryNotices({
  analysis,
  signedIn,
  keepFiles,
  fileRetentionAvailable,
  libraryUnavailable,
  onRetry,
}: LibraryNoticesProps) {
  const originalsMissing = analysis.missingOriginals
  const missingCount = plural(originalsMissing, 'activity', 'activities')
  const missingText =
    originalsMissing === 1
      ? `${missingCount} is missing its original file. Re-import it to restore the original.`
      : `${missingCount} are missing their original file. Re-import them to restore the originals.`
  const missingShown = signedIn && keepFiles && fileRetentionAvailable && originalsMissing > 0
  const outdatedCount = analysis.state.outdatedActivities
  const outdatedShown = outdatedCount > 0
  const incompatibleCount = analysis.state.incompatibleActivities
  const incompatibleShown = incompatibleCount > 0
  const incompatibleText =
    `${plural(incompatibleCount, 'saved activity', 'saved activities')} ` +
    `${incompatibleCount === 1 ? 'was' : 'were'} made by a newer version of this app and ` +
    `${incompatibleCount === 1 ? 'is' : 'are'} left out. Reload the page to update the app.`

  // The rebuild button goes once nothing is outdated, so when a rebuild ends, focus moves to the
  // notice region, which is always mounted. A request the app refuses without starting a rebuild
  // must not leave a later import's end to move focus, so only a started rebuild counts. Focus
  // that the user has moved elsewhere is left alone.
  const [rebuildPhase, setRebuildPhase] = useState<RebuildPhase>('idle')
  // Detected during render, as SyncStatus detects an upload, so the effect only moves focus.
  if (rebuildPhase === 'requested') setRebuildPhase(analysis.busy ? 'started' : 'idle')
  else if (rebuildPhase === 'started' && !analysis.busy) setRebuildPhase('finished')
  const rebuildNoticeRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (rebuildPhase !== 'finished') return
    const active = document.activeElement
    if (active === null || active === document.body || active === updateRef.current) {
      rebuildNoticeRef.current?.focus()
    }
  }, [rebuildPhase])

  return (
    <>
      {/* Always mounted, so a message put in it is announced. It takes no room while empty. */}
      <p role="status" className={libraryUnavailable ? 'notice' : 'sr-only'}>
        {libraryUnavailable ? LIBRARY_UNAVAILABLE : ''}
      </p>
      {signedIn && analysis.libraryStatus === 'failed' && (
        <section className="notice notice--critical" aria-label="Library">
          <p role="alert">Your library could not be loaded.</p>
          <button type="button" className="btn" onClick={onRetry}>
            Retry
          </button>
        </section>
      )}
      <section
        className={missingShown ? 'notice' : 'sr-only'}
        aria-label={missingShown ? 'Missing original files' : undefined}
      >
        <p role="status">{missingShown ? missingText : ''}</p>
      </section>
      <section
        className={outdatedShown ? 'notice' : 'sr-only'}
        aria-label={outdatedShown ? 'Saved activity updates' : undefined}
      >
        <p role="status">{outdatedShown ? outdatedText(outdatedCount, signedIn) : ''}</p>
        {outdatedShown && signedIn && !fileRetentionAvailable && <p>{ORIGINALS_UNAVAILABLE}</p>}
        {outdatedShown && signedIn && (
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
      {/* Always mounted, so the outcome of a rebuild is announced and stays after the notice above unmounts. */}
      <div
        role="status"
        ref={rebuildNoticeRef}
        tabIndex={-1}
        className={analysis.rebuildNotice ? undefined : 'sr-only'}
      >
        {analysis.rebuildNotice}
      </div>
      <section
        className={incompatibleShown ? 'notice' : 'sr-only'}
        aria-label={incompatibleShown ? 'Incompatible saved activities' : undefined}
      >
        <p role="status">{incompatibleShown ? incompatibleText : ''}</p>
      </section>
      {analysis.state.hiddenDuplicates > 0 && (
        <p className="secondary">{hiddenCopiesText(analysis.state.hiddenDuplicates)}</p>
      )}
    </>
  )
}
