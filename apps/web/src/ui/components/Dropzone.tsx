import { useId, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { HISTORY_ADVICE } from '../exportGuides'
import { useDelayedFlag } from '../useDelayedFlag'
import { UploadIcon } from './icons'
import { STRIP_DELAY_MS } from './ImportStatus'
import { SampleButton } from './SampleButton'
import { isFileDrag, useFilePicker } from './useFilePicker'
import './Dropzone.css'

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  onSample: () => void
  /** Shows the export guides on the page, for a visitor who has no files yet. */
  onShowGuides: () => void
  busy: boolean
  /** A signed-in visitor already has a library, so the sample is not offered to them. */
  signedIn: boolean
}

interface SampleActionsProps {
  busy: boolean
  onSample: () => void
  /** The id of the reason line, which the sample button describes itself by while it shows. */
  hintId: string
  hintShown: boolean
}

/** The sample button, and beside it the reason it is off while an import runs. */
function SampleActions({ busy, onSample, hintId, hintShown }: SampleActionsProps) {
  return (
    <div className="dropzone__actions">
      <SampleButton busy={busy} onSample={onSample} describedBy={hintShown ? hintId : undefined}>
        See a sample athlete
      </SampleButton>
      {hintShown && (
        <p id={hintId} className="dropzone__busy muted">
          Available when the current import finishes.
        </p>
      )}
    </div>
  )
}

/**
 * The landing page's drop target. Files are accepted even while busy: the analysis worker handles
 * requests in order, so a file chosen during a load is queued rather than lost. Only the sample
 * stays off while busy. The window drop listeners and the progress live in ImportStatus.
 */
export function Dropzone({ onFiles, onSample, onShowGuides, busy, signedIn }: DropzoneProps) {
  const picker = useFilePicker(onFiles)
  const [dragging, setDragging] = useState(false)
  const busyHintId = useId()
  // The reason the sample is off waits for the busy strip's delay, so a quick import shows nothing.
  const hintShown = useDelayedFlag(busy, STRIP_DELAY_MS)

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    // Always prevent the default, or the browser navigates to the dropped file.
    event.preventDefault()
    if (isFileDrag(event)) setDragging(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDragging(false)
  }

  return (
    <div
      className={dragging ? 'dropzone dropzone--over' : 'dropzone'}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      // A drop leaves no dragleave behind, so the highlight is cleared here.
      onDrop={() => setDragging(false)}
    >
      <div className="dropzone__target">
        <p className="dropzone__title">Add FIT, GPX or TCX files, or a Strava export zip</p>
        <p className="dropzone__hint">{HISTORY_ADVICE}</p>
        <p className="dropzone__drag">Drag them onto this box, or</p>
        <button type="button" className="btn btn-primary" onClick={picker.open}>
          <UploadIcon />
          Add files
        </button>
      </div>
      <p className="dropzone__guides">
        <span className="dropzone__touch">Exports usually come from a computer. </span>
        <button type="button" className="dropzone__link" onClick={onShowGuides}>
          No files yet? How to get them
        </button>
      </p>
      {signedIn ? null : (
        <SampleActions busy={busy} onSample={onSample} hintId={busyHintId} hintShown={hintShown} />
      )}
      {picker.input}
    </div>
  )
}
