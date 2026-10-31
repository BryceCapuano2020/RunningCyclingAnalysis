import { AddFilesButton } from '../components/AddFilesButton'
import { HeldBackList } from '../components/HeldBackList'
import { heldViewFor } from './heldLibraryView'
import type { AnalysisController } from '../useAnalysis'
import { PAGE_HEADING_ID } from './pageHeading'
import './RestoringPage.css'

export interface HeldLibraryPageProps {
  analysis: AnalysisController
  signedIn: boolean
  /** Whether originals can be rebuilt from at all (the server's file retention is on). */
  fileRetentionAvailable: boolean
  onFiles: (files: File[]) => void
}

/**
 * The page for a library that is there but whose results are not shown: its digests were made by an older
 * model and are being rebuilt, or added again. It is a page, not a notice, so the visitor is never sent
 * back to the first-visit landing page and never shown a sample in place of their own library.
 */
export function HeldLibraryPage({
  analysis,
  signedIn,
  fileRetentionAvailable,
  onFiles,
}: HeldLibraryPageProps) {
  const view = heldViewFor(analysis, signedIn, fileRetentionAvailable)
  return (
    <section className="restoring" aria-busy={analysis.busy && view.update}>
      <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
        {view.title}
      </h1>
      {view.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="restoring__actions">
        {view.update && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              // aria-disabled while busy, not disabled: a disabled button drops the focus it holds.
              if (!analysis.busy) analysis.rebuildSavedActivities()
            }}
            disabled={!fileRetentionAvailable}
            aria-disabled={analysis.busy}
          >
            {analysis.busy ? 'Updating…' : 'Update now'}
          </button>
        )}
        {view.addFiles && <AddFilesButton onFiles={onFiles} />}
      </div>
      <HeldBackList activities={analysis.state.heldOut} />
    </section>
  )
}

/** The library could not be loaded or read. The message above the page has the retry; this says what the page is. */
export function UnavailableLibraryPage({ canRetry }: { canRetry: boolean }) {
  return (
    <section className="restoring">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
        Your library is not showing yet
      </h1>
      <p>
        {canRetry
          ? 'It could not be loaded. Nothing was lost. Use Retry, or reload the page.'
          : 'It could not be read from this browser. Nothing was lost. Reload the page to try again.'}
      </p>
    </section>
  )
}
