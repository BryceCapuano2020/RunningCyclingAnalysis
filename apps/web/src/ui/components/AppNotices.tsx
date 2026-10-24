import type { AnalysisController } from '../useAnalysis'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { LibraryNotices } from './LibraryNotices'
import { RejectedFiles } from './RejectedFiles'
import { SyncStatus } from './SyncStatus'
import './AppNotices.css'

/** Shown on every page while the sample is loaded. It says once that the sample is not kept. */
const SAMPLE_BANNER = `Showing a sample athlete, ${SAMPLE_DESCRIPTION}. The sample is not kept: add your own files and they replace it.`

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
  /** The last import's summary lists what moved in the athlete's numbers. */
  moved?: boolean
}

/**
 * The messages under the header, on every page: sync, library, sample, errors and rejected files.
 * It stays mounted, so each live region in it is announced when its message appears.
 */
export function AppNotices({
  analysis,
  signedIn,
  keepFiles,
  fileRetentionAvailable,
  accountsUnavailable,
  accountError,
  runThenFocus,
  moved = false,
}: AppNoticesProps) {
  const { result, isSample, rejected, unsupportedFiles } = analysis.state
  return (
    <div className="app__notices">
      <SyncStatus
        uploading={analysis.uploading}
        issues={analysis.state.syncIssues}
        signedIn={signedIn}
        moved={moved}
      />
      <LibraryNotices
        analysis={analysis}
        signedIn={signedIn}
        keepFiles={keepFiles}
        fileRetentionAvailable={fileRetentionAvailable}
        onRetry={() => runThenFocus(analysis.retryLibrary)}
      />
      <p role="status" className={result !== null && isSample ? 'sample-banner' : 'sr-only'}>
        {result !== null && isSample ? SAMPLE_BANNER : ''}
      </p>
      {accountError && !accountsUnavailable && (
        <p className="notice notice--critical" role="alert">
          {accountError}
        </p>
      )}
      {analysis.error && (
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
      {analysis.busy && (
        <div>
          <button
            type="button"
            className="btn"
            onClick={(event) => runThenFocus(analysis.stop, event.currentTarget)}
          >
            Stop current analysis
          </button>
        </div>
      )}
      <RejectedFiles
        rejected={rejected}
        unsupportedFiles={unsupportedFiles}
        duplicates={analysis.importOutcome?.duplicates ?? []}
      />
    </div>
  )
}
