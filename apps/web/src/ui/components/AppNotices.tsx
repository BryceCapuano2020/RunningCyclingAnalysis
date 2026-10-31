import type { AnalysisController } from '../useAnalysis'
import { detailCoverageLine, judgedDetail } from '../analysis/detailCoverage'
import {
  countedDespiteText,
  leftOutNote,
  leftOutRuns,
  labelledText,
  walkingPaceText,
} from '../analysis/walkingPaceCopy'
import { SPORT_LABEL } from '../sports'
import { hrefFor } from '../route'
import type { CountedRunsController } from '../useCountedRuns'
import { movedAnything, type MovedItem } from '../analysis/whatMoved'
import type { Route } from '../route'
import { adoptionText } from '../analysis/adoptionCopy'
import { outboxText } from '../analysis/outboxCopy'
import { ImportNotice } from './ImportNotice'
import { IncompleteImportNotice } from './IncompleteImportNotice'
import { AboutData } from './AboutData'
import { DeviceOffer } from './DeviceOffer'
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
  /** Who is signed in, which the offer of what this browser kept names. */
  accountUser?: { userId: string; email: string }
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
  /** The runs counted despite walking pace: the way back, what the last change did and whether it was kept. */
  countedRuns?: CountedRunsController
  /** The library page is on screen and says what is out of date itself, so the notices leave it out. */
  libraryPanel?: boolean
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
  accountUser,
  accountsUnavailable,
  accountError,
  runThenFocus,
  moved = NO_MOVED,
  atBalance = false,
  page,
  pageNotice = '',
  walkingNote = false,
  countedRuns,
  libraryPanel = false,
}: AppNoticesProps) {
  const { result, isSample } = analysis.state
  const neutralStop = analysis.error !== null && analysis.errorNeutral
  // The pages say how a deletion ended beside the activity. With no result left, as when the last activity
  // was deleted, no page does, so the notices say it.
  const bareLibraryNotice = result === null ? analysis.libraryNotice : null
  const bareLibraryError = result === null ? analysis.libraryError : null
  // Notes about the data that need no action. The walking-pace count is said where runs are listed or analysed.
  const {
    hiddenDuplicates: copies,
    walkingPaceRuns: walking,
    labelledRuns: labelled = 0,
  } = analysis.state
  const left = leftOutRuns(analysis.state.library)
  // Run, when every run is left out, has its own button to count them, so it leaves the offer to open one out.
  const offerToOpen = !(left.allLeftOut && left.runs[0]?.sport === page)
  const aboutNotes = [
    ...(copies > 0 ? [{ id: 'copies', count: copies, text: hiddenCopiesText(copies) }] : []),
    ...(walkingNote && walking > 0
      ? [{ id: 'walking', count: walking, text: walkingPaceText(walking, offerToOpen) }]
      : []),
    ...(walkingNote && labelled > 0
      ? [{ id: 'labelled', count: labelled, text: labelledText(labelled) }]
      : []),
  ]
  // A signed-in library can read older detail back from a saved original, so the line, like the list's tag, is for this browser's own.
  const detailLine = detailCoverageLine(
    judgedDetail(analysis.detail, { isSample: analysis.state.isSample, signedIn }),
    analysis.savedActivities.length,
  )
  // An import that added only runs the analysis leaves out says so with its sentence, on the pages that do not
  // say it themselves: Balance's headline, and Run's and Activities' own note. It ends with where to count them.
  const leftOutSport = left.runs[0]?.sport
  const leftOutLine =
    left.allLeftOut && leftOutSport !== undefined && !walkingNote && !atBalance ? (
      <>
        {leftOutNote(left.runs.length)}{' '}
        <a
          href={hrefFor({ page: leftOutSport })}
        >{`Open ${SPORT_LABEL[leftOutSport]} to count them.`}</a>
      </>
    ) : null
  // The runs counted despite walking pace: the way back, where runs are listed or analysed.
  const countedHere = analysis.state.countedWalkingRuns
  const outboxLine = analysis.outbox === null ? null : outboxText(analysis.outbox)
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
        leftOutLine={leftOutLine}
        onDismiss={analysis.dismissSummary}
      />
      {sample.pill}
      {/* Shown while an import runs too: the hold it explains stays on, and so must its way out. */}
      {analysis.incompleteImport !== null && (
        <IncompleteImportNotice
          manifest={analysis.incompleteImport}
          onAccept={analysis.acceptIncompleteImport}
        />
      )}
      <AboutData notes={aboutNotes} />
      <div className="app__live" role="status" aria-atomic="false">
        <SyncStatus
          uploading={analysis.uploading}
          savedCount={analysis.savedCount}
          issues={analysis.state.syncIssues}
          signedIn={signedIn}
          moved={movedAnything(moved)}
          hiddenCopies={analysis.state.hiddenDuplicates}
        />
        <LibraryNotices
          analysis={analysis}
          signedIn={signedIn}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
          panelShown={libraryPanel}
          onRetry={() => runThenFocus(analysis.retryLibrary)}
        />
        {outboxLine !== null && <p className="notice">{outboxLine}</p>}
        {/* The visible result has a button to put it away, so it sits outside this region; this says it once. */}
        {analysis.adoption !== null && <p className="sr-only">{adoptionText(analysis.adoption)}</p>}
        {bareLibraryNotice !== null && <p className="notice">{bareLibraryNotice}</p>}
        {sample.banner}
        {/* A stop the visitor asked for is news, not a fault, so it is never an alert. */}
        {neutralStop && <p className="notice">{analysis.error}</p>}
        {pageNotice !== '' && <p className="app__notice">{pageNotice}</p>}
        {/* What the last change to the counted runs did, for a screen reader: the buttons that made it are gone. */}
        {countedRuns !== undefined && <p className="sr-only">{countedRuns.status}</p>}
        {countedRuns?.notKept != null && <p className="notice">{countedRuns.notKept}</p>}
      </div>
      {signedIn && accountUser !== undefined && (
        <DeviceOffer
          offer={analysis.deviceOffer}
          adoption={analysis.adoption}
          account={accountUser}
          busy={analysis.busy}
          onAdd={analysis.adoptDevice}
          onRemove={analysis.forgetDeviceLibrary}
          onDismissResult={analysis.dismissAdoption}
          runThenFocus={runThenFocus}
        />
      )}
      {/* Outside the live region: the sr-only line above already says what the press did, so it is said once. */}
      {walkingNote && countedRuns !== undefined && countedHere.length > 0 && (
        <p className="notice">
          {countedDespiteText(countedHere.length)}{' '}
          <button
            type="button"
            className="btn"
            onClick={(event) =>
              runThenFocus(() => countedRuns.stop(countedHere), event.currentTarget)
            }
          >
            {countedHere.length === 1 ? 'Leave it out' : 'Leave them out'}
          </button>
        </p>
      )}
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
