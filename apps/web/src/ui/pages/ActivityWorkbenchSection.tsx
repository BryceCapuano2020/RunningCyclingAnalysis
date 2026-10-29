import type { ReactNode } from 'react'
import { useFilePicker } from '../components/useFilePicker'

const HEADING_ID = 'activity-workbench-heading'

/** The section every state sits in, named by what the athlete is looking at. */
export function WorkbenchSection({
  sport,
  note = false,
  children,
}: {
  sport?: string
  /** The section only says why there is no timeline, so it is set quietly after the page's own figures. */
  note?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={
        note ? 'section activity-workbench activity-workbench--note' : 'section activity-workbench'
      }
      data-sport={sport}
      aria-labelledby={HEADING_ID}
    >
      <h2 id={HEADING_ID}>In detail</h2>
      {children}
    </section>
  )
}

/**
 * What an activity says when this browser holds no recording of it and keeps no original file. Said plainly: the
 * recording is what was dropped, and everything else on the page is still here.
 */
export const MISSING_DETAIL =
  "Detailed readings for this activity aren't kept on this device: the browser keeps them for your newest activities, up to its storage limit. Its summary, bests and splits are still here."

/** The file picker behind "Add this activity's file again", which is a way to the detail and not the page's point. */
function AddFileAgain({ onFiles }: { onFiles: (files: File[]) => void }) {
  const picker = useFilePicker(onFiles)
  return (
    <>
      <button className="btn" type="button" onClick={picker.open}>
        Add this activity&apos;s file again
      </button>
      {picker.input}
    </>
  )
}

/**
 * The section of an activity with no timeline to show: why there is none, and the one way to get it. It is a
 * note after the page's summary, splits and bests, not a hole where the timeline would be.
 */
export function DetailNote({
  status,
  onRetry,
  onReadOriginal,
  onAddFiles,
}: {
  status: 'failed' | 'originalAvailable' | 'missing'
  onRetry: () => void
  onReadOriginal: () => void
  onAddFiles?: (files: File[]) => void
}) {
  return (
    <WorkbenchSection note>
      <p className="secondary" role={status === 'failed' ? 'alert' : 'status'}>
        {status === 'failed'
          ? 'The recorded details could not be loaded.'
          : status === 'originalAvailable'
            ? 'This browser has no detailed readings for this activity. They can be read from the saved original file.'
            : MISSING_DETAIL}
      </p>
      {status === 'failed' && (
        <div className="activity-workbench__actions">
          <button className="btn" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {status === 'originalAvailable' && (
        <div className="activity-workbench__actions">
          <button className="btn" type="button" onClick={onReadOriginal}>
            Read original file
          </button>
        </div>
      )}
      {status === 'missing' && onAddFiles !== undefined && (
        <div className="activity-workbench__actions">
          <AddFileAgain onFiles={onAddFiles} />
        </div>
      )}
    </WorkbenchSection>
  )
}
