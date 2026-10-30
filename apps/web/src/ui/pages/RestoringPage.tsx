import { AddFilesButton } from '../components/AddFilesButton'
import { PAGE_HEADING_ID } from './pageHeading'
import './RestoringPage.css'

export interface RestoringPageProps {
  /** Receives the files the visitor adds while the results are restored. */
  onFiles: (files: File[]) => void
}

/**
 * Shown on a reload of a visit that kept results, until the kept library replies. The library does
 * not wait for the account lookup: it loads a moment after the page does (see DEVICE_GRACE_MS), so a
 * slow API costs a returning visitor nothing. It holds the landing page's place, so they are not asked
 * to add their files again before their results arrive. It has an Add files control, so it is never a
 * dead end, and it ends when the library replies, not before.
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
