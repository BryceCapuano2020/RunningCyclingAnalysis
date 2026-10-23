import { useEffect, useRef } from 'react'
import { plural } from '../components/plural'
import type { AnalysisController } from '../useAnalysis'

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
  'Your library is unavailable right now. Analysis still runs in your browser and nothing is being saved.'

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
  const missingText =
    originalsMissing === 1
      ? '1 activity is missing its original file. Re-import it to restore the original.'
      : `${originalsMissing} activities are missing their original file. Re-import them to restore the originals.`
  const missingShown = signedIn && keepFiles && fileRetentionAvailable && originalsMissing > 0
  const outdatedCount = analysis.state.outdatedActivities
  const outdatedShown = signedIn && outdatedCount > 0
  const outdatedText =
    `${outdatedCount} saved ${outdatedCount === 1 ? 'activity uses' : 'activities use'} an older ` +
    `analysis model and ${outdatedCount === 1 ? 'is' : 'are'} excluded from these results.`
  const incompatibleCount = analysis.state.incompatibleActivities
  const incompatibleShown = incompatibleCount > 0
  const incompatibleText =
    `${incompatibleCount} saved ${incompatibleCount === 1 ? 'activity was' : 'activities were'} ` +
    `created with a newer app version and ${incompatibleCount === 1 ? 'is' : 'are'} excluded ` +
    'from analysis. Use a compatible app version to analyze them.'

  // The rebuild button is disabled while it runs, and its card goes once nothing is outdated, so
  // the outcome is announced from the notice region, which is always mounted.
  const rebuildRequested = useRef(false)
  const rebuildNoticeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (analysis.busy || !rebuildRequested.current) return
    rebuildRequested.current = false
    rebuildNoticeRef.current?.focus()
  }, [analysis.busy])

  return (
    <>
      {/* Always mounted, so a message put in it is announced. It takes no room while empty. */}
      <p role="status" className={libraryUnavailable ? 'card' : 'app__quiet'}>
        {libraryUnavailable ? LIBRARY_UNAVAILABLE : ''}
      </p>
      {signedIn && analysis.libraryStatus === 'failed' && (
        <section className="card app__error" aria-label="Library">
          <p role="alert">Your library could not be loaded.</p>
          <button type="button" className="btn" onClick={onRetry}>
            Retry
          </button>
        </section>
      )}
      <section
        className={missingShown ? 'card' : 'app__quiet'}
        aria-label={missingShown ? 'Missing original files' : undefined}
      >
        <p role="status">{missingShown ? missingText : ''}</p>
      </section>
      <section
        className={outdatedShown ? 'card' : 'app__quiet'}
        aria-label={outdatedShown ? 'Saved activity updates' : undefined}
      >
        <p role="status">{outdatedShown ? outdatedText : ''}</p>
        {outdatedShown && !fileRetentionAvailable && (
          <p>
            Original file storage is unavailable on this deployment, so saved activities cannot be
            rebuilt from the library. Import the original files to update them; existing saved
            originals are not deleted.
          </p>
        )}
        {outdatedShown && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              rebuildRequested.current = true
              analysis.rebuildSavedActivities()
            }}
            disabled={analysis.busy || !fileRetentionAvailable}
          >
            {analysis.busy ? 'Rebuilding saved activities…' : 'Rebuild saved activities'}
          </button>
        )}
      </section>
      {/* Always mounted, so the outcome of a rebuild is announced and stays after the card above unmounts. */}
      <div role="status" ref={rebuildNoticeRef} tabIndex={-1}>
        {analysis.rebuildNotice}
      </div>
      <section
        className={incompatibleShown ? 'card' : 'app__quiet'}
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
