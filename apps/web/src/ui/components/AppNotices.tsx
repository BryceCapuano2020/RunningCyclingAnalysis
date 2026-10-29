import type { AnalysisController } from '../useAnalysis'
import { detailCoverageLine } from '../analysis/detailCoverage'
import { walkingPaceText } from '../analysis/walkingPaceCopy'
import { movedAnything, type MovedItem } from '../analysis/whatMoved'
import type { Route } from '../route'
import { ImportNotice } from './ImportNotice'
import { AboutData } from './AboutData'
import { hiddenCopiesText } from '../analysis/hiddenCopiesCopy'
import { LibraryNotices } from './LibraryNotices'
import { SyncStatus } from './SyncStatus'
import { useSampleNotice } from './useSampleNotice'
import './AppNotices.css'

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
  /** The page on screen: the sample's banner shows in full on the first page it is seen on. */
  page: Route['page']
  /** Why a link shows the landing page, or that an account was deleted. Empty when there is nothing to say. */
  pageNotice?: string
  /** On Run and Activities, the count of saved runs at walking pace is said under the notices. */
  walkingNote?: boolean
}

/**
 * The one notice region at the top of the page's main area: the summary of the last import, sync,
 * library, sample and errors. The messages sit in one live region that is always mounted, and a message
 * is announced when it is added to it, so there is one region to hear rather than a dozen empty ones.
 * Alerts are their own regions, as an alert is announced when it mounts.
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
  page,
  pageNotice = '',
  walkingNote = false,
}: AppNoticesProps) {
  const { result, isSample } = analysis.state
  const neutralStop = analysis.error !== null && analysis.errorNeutral
  // The pages say how a deletion ended beside the activity. With no result left, as when the last activity
  // was deleted, no page does, so the notices say it.
  const bareLibraryNotice = result === null ? analysis.libraryNotice : null
  const bareLibraryError = result === null ? analysis.libraryError : null
  // Notes about the data that need no action. The walking-pace count is said where runs are listed or analysed.
  const aboutNotes = [
    ...(analysis.state.hiddenDuplicates > 0
      ? [hiddenCopiesText(analysis.state.hiddenDuplicates)]
      : []),
    ...(walkingNote && analysis.state.walkingPaceRuns > 0
      ? [walkingPaceText(analysis.state.walkingPaceRuns)]
      : []),
  ]
  // An account that keeps its files can read the older detail back from them, so the line is for the rest.
  const detailLine =
    signedIn && keepFiles && fileRetentionAvailable
      ? null
      : detailCoverageLine(analysis.detail, analysis.savedActivities.length)
  const sample = useSampleNotice({ page, shown: result !== null && isSample })
  return (
    <div className="app__notices">
      <ImportNotice
        outcome={analysis.importOutcome}
        busy={analysis.busy}
        rejected={analysis.state.rejected}
        unsupportedFiles={analysis.state.unsupportedFiles}
        moved={moved}
        atBalance={atBalance}
        detailLine={detailLine}
        onDismiss={analysis.dismissSummary}
      />
      {sample.pill}
      <AboutData notes={aboutNotes} />
      <div className="app__live" role="status" aria-atomic="false">
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
          onRetry={() => runThenFocus(analysis.retryLibrary)}
        />
        {bareLibraryNotice !== null && <p className="notice">{bareLibraryNotice}</p>}
        {sample.banner}
        {/* A stop the visitor asked for is news, not a fault, so it is never an alert. */}
        {neutralStop && <p className="notice">{analysis.error}</p>}
        {pageNotice !== '' && <p className="app__notice">{pageNotice}</p>}
      </div>
      {bareLibraryError !== null && (
        <p className="notice notice--critical" role="alert">
          {bareLibraryError}
        </p>
      )}
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
