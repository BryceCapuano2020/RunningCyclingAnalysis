import { AddFilesButton } from '../components/AddFilesButton'
import { PAGE_HEADING_ID } from './pageHeading'
import './RestoringPage.css'

export interface RestoringPageProps {
  /** Receives the files the visitor adds while the results are restored. */
  onFiles: (files: File[]) => void
}

/**
 * Shown on a reload of a visit that kept results, while the account answers and the kept library
 * loads. It holds the landing page's place, so a returning visitor is not asked to add their files
 * again before their results arrive. It has an Add files control, so it is never a dead end, and it
 * ends when the kept library replies, not before.
 */
export function RestoringPage({ onFiles }: RestoringPageProps) {
  return (
    <section className="restoring" aria-busy="true">
      <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
        Restoring your results
      </h1>
      <div className="restoring__actions">
        <AddFilesButton onFiles={onFiles} />
      </div>
      <div className="restoring__cards" aria-hidden="true">
        <span className="restoring__card" />
        <span className="restoring__card" />
        <span className="restoring__card" />
      </div>
    </section>
  )
}
