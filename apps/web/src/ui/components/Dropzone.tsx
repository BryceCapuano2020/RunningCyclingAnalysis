import { useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode } from 'react'
import { HISTORY_ADVICE } from '../exportGuides'
import { useTouchFirst } from '../useMediaQuery'
import { UploadIcon } from './icons'
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
  onSample: () => void
  /** The sample leads, so it is the primary button. */
  primary: boolean
  /** Another action in the same row, after the sample button. */
  after?: ReactNode
}

/** The sample button, with another action beside it when the row has one. */
function SampleActions({ onSample, primary, after }: SampleActionsProps) {
  return (
    <div className="dropzone__actions">
      <SampleButton busy={false} onSample={onSample} primary={primary}>
        See a sample athlete
      </SampleButton>
      {after}
    </div>
  )
}

/**
 * The landing page's drop target. Files are accepted even while busy: the analysis worker handles
 * requests in order, so a file chosen during a load is queued rather than lost. The sample is left
 * off the page while an import runs: it could not start then, and a greyed button only invites a press. The window drop listeners and the progress live in ImportStatus.
 */
export function Dropzone({ onFiles, onSample, onShowGuides, busy, signedIn }: DropzoneProps) {
  const picker = useFilePicker(onFiles)
  // On a touch screen the actions sit directly under the pitch as a compact row, the sample leading, and
  // nothing says to drag: a finger cannot drop a file here.
  const touch = useTouchFirst()
  // The sample cannot start while an import runs, so it is not offered then.
  const showSample = !signedIn && !busy
  const touchFirst = touch && showSample
  const [dragging, setDragging] = useState(false)

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

  const addFiles = (primary: boolean) => (
    <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={picker.open}>
      <UploadIcon />
      Add files
    </button>
  )

  if (touch) {
    return (
      <div className="dropzone dropzone--touch">
        {touchFirst ? (
          <SampleActions onSample={onSample} primary after={addFiles(false)} />
        ) : (
          <div className="dropzone__actions">{addFiles(true)}</div>
        )}
        <p className="dropzone__hint">
          {`Add FIT, GPX or TCX files, or a Strava export zip. ${HISTORY_ADVICE}`}
        </p>
        <p className="dropzone__guides">
          <span className="dropzone__touch">Exports usually come from a computer. </span>
          <button type="button" className="dropzone__link" onClick={onShowGuides}>
            No files yet? How to get them
          </button>
        </p>
        {picker.input}
      </div>
    )
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
        {addFiles(true)}
      </div>
      <p className="dropzone__guides">
        <span className="dropzone__touch">Exports usually come from a computer. </span>
        <button type="button" className="dropzone__link" onClick={onShowGuides}>
          No files yet? How to get them
        </button>
      </p>
      {showSample ? <SampleActions onSample={onSample} primary={false} /> : null}
      {picker.input}
    </div>
  )
}
