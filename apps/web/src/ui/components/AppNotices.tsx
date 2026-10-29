import type { AnalysisController } from '../useAnalysis'
import { movedAnything, type MovedItem } from '../analysis/whatMoved'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { ImportNotice } from './ImportNotice'
import { LibraryNotices } from './LibraryNotices'
import { SyncStatus } from './SyncStatus'
import './AppNotices.css'

/** Shown on every page while the sample is loaded. It says once that the sample is not kept. */
const SAMPLE_BANNER = `Sample athlete, ${SAMPLE_DESCRIPTION}. Not kept: add files to replace it.`
const NO_MOVED: MovedItem[] = []

export interface AppNoticesProps {
  analysis: AnalysisController
  signedIn: boolean
  keepFiles: boolean
  fileRetentionAvailable: boolean
  /** Accounts cannot be reached on this deployment right now. */
  accountsUnavailable: boolean
  accountError: string | null
  /** Runs an action whose button goes away when it finishes, then puts focus back on the page. */
  runThenFocus: (action: () => void, control?: Element) => void
  /** What the last import moved in the athlete's numbers. */
  moved?: MovedItem[]
  /** On the Balance page the summary's link would point at the page it is already on. */
  atBalance?: boolean
  /** On the Activities page, the library is named quietly with its count. */
  activitiesPage?: boolean
  /** On Run and Activities, the count of saved runs at walking pace is said under the notices. */
  walkingNote?: boolean
}

/**
 * The one notice region under the header, on every page: the summary of the last import, sync,
 * library, sample, errors and the library's count. It stays mounted, so each live region in it is
 * announced when its message appears.
 */
export function AppNotices({
  analysis,
  signedIn,
  keepFiles,
  fileRetentionAvailable,
  accountsUnavailable,
  accountError,
  runThenFocus,
  moved = NO_MOVED,
  atBalance = false,
  activitiesPage = false,
  walkingNote = false,
}: AppNoticesProps) {
  const { result, isSample } = analysis.state
  const neutralStop = analysis.error !== null && analysis.errorNeutral
  const kept = analysis.savedActivities.length
  // The pages say how a deletion ended beside the activity. With no result left, as when the last activity
  // was deleted, no page does, so the notices say it.
  const bareLibraryNotice = result === null ? analysis.libraryNotice : null
  const bareLibraryError = result === null ? analysis.libraryError : null
  // The Activities subtitle gives the count, so this line says only where the library is kept.
  const keptText = signedIn ? 'Saved to your account.' : 'Kept in this browser.'
  return (
    <div className="app__notices">
      <ImportNotice
        outcome={analysis.importOutcome}
        busy={analysis.busy}
        rejected={analysis.state.rejected}
        unsupportedFiles={analysis.state.unsupportedFiles}
        moved={moved}
        atBalance={atBalance}
        onDismiss={analysis.dismissSummary}
      />
      <SyncStatus
        uploading={analysis.uploading}
        savedCount={analysis.savedCount}
        issues={analysis.state.syncIssues}
        signedIn={signedIn}
        moved={movedAnything(moved)}
      />
      <LibraryNotices
        analysis={analysis}
        signedIn={signedIn}
        keepFiles={keepFiles}
        fileRetentionAvailable={fileRetentionAvailable}
        walkingNote={walkingNote}
        onRetry={() => runThenFocus(analysis.retryLibrary)}
      />
      {activitiesPage && kept > 0 && <p className="secondary">{keptText}</p>}
      <p role="status" className={bareLibraryNotice === null ? 'sr-only' : 'notice'}>
        {bareLibraryNotice ?? ''}
      </p>
      {bareLibraryError !== null && (
        <p className="notice notice--critical" role="alert">
          {bareLibraryError}
        </p>
      )}
      <p role="status" className={result !== null && isSample ? 'sample-banner' : 'sr-only'}>
        {result !== null && isSample ? SAMPLE_BANNER : ''}
      </p>
      {/* A stop the visitor asked for is news, not a fault, so it is never an alert. */}
      <p role="status" className={neutralStop ? 'notice' : 'sr-only'}>
        {neutralStop ? analysis.error : ''}
      </p>
      {accountError && !accountsUnavailable && (
        <p className="notice notice--critical" role="alert">
          {accountError}
        </p>
      )}
      {analysis.error && !neutralStop && (
        <div className="notice notice--critical" role="alert">
          <p>
            {analysis.errorIssue === 'daily-limit'
              ? analysis.error
              : `Something went wrong: ${analysis.error}`}
          </p>
          {analysis.workerStopped && (
            <button
              type="button"
              className="btn"
              onClick={(event) => runThenFocus(analysis.retryWorker, event.currentTarget)}
            >
              Restart analysis
            </button>
          )}
        </div>
      )}
    </div>
  )
}
