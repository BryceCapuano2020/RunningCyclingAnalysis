import { AddFilesButton } from '../components/AddFilesButton'
import { HeldBackList } from '../components/HeldBackList'
import { heldViewFor } from './heldLibraryView'
import type { AnalysisController } from '../useAnalysis'
import './HeldLibraryPage.css'
import { PageHeading } from '../components/PageHeading'
import { limitReached } from '../limitCopy'

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
    <section className="held" aria-busy={analysis.busy && view.update}>
      <PageHeading>{view.title}</PageHeading>
      {view.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className="held__actions">
        {view.update && (
          <button
            type="button"
            className="btn btn-primary"
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
        {/* Update now is the page's main action when both are offered. */}
        {view.addFiles && <AddFilesButton onFiles={onFiles} primary={!view.update} />}
      </div>
      <HeldBackList activities={analysis.state.heldOut} />
    </section>
  )
}

/** The library could not be loaded or read. The message above the page has the retry; this says what the page is. */
export function UnavailableLibraryPage({
  canRetry,
  resultsFailed = false,
  onRetry,
}: {
  canRetry: boolean
  /** The library is fine; the server's results could not be fetched. */
  resultsFailed?: boolean | undefined
  /** Given when the page itself offers the retry: the results could not be fetched, which no notice above the page says. */
  onRetry?: (() => void) | undefined
}) {
  return (
    <section className="held">
      <PageHeading>Your library is not showing yet</PageHeading>
      <p>
        {resultsFailed
          ? 'Your results could not be fetched.'
          : canRetry
            ? 'It could not be loaded. Nothing was lost. Use Retry, or reload the page.'
            : 'It could not be read from this browser. Nothing was lost. Reload the page to try again.'}
      </p>
      {resultsFailed && !onRetry && <p>{limitReached('stateRead')}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  )
}
