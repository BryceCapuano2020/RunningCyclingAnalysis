import { useId, useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent } from 'react'
import { isFileDrag, useFilePicker } from './useFilePicker'
import './Dropzone.css'

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  onSample: () => void
  busy: boolean
  /** Signed-in imports are saved to the library, so the copy and the sample button change. */
  signedIn: boolean
}

/**
 * The landing page's drop target. Files are accepted even while busy: the analysis worker handles
 * requests in order, so a file chosen during a load is queued rather than lost. Only the sample
 * stays off while busy. The window drop listeners and the progress live in ImportStatus.
 */
export function Dropzone({ onFiles, onSample, busy, signedIn }: DropzoneProps) {
  const picker = useFilePicker(onFiles)
  const [dragging, setDragging] = useState(false)
  const busyHintId = useId()

  function handleTargetKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      picker.open()
    }
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    // Always prevent the default, or the browser navigates to the dropped file.
    event.preventDefault()
    if (isFileDrag(event)) setDragging(true)
  }

  function handleSample() {
    // aria-disabled, not disabled: a disabled button drops the focus it holds, so guard the click.
    if (!busy) onSample()
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
      <div
        className="dropzone__target"
        role="button"
        tabIndex={0}
        onClick={picker.open}
        onKeyDown={handleTargetKey}
      >
        <p className="dropzone__title">Drop FIT, GPX or TCX files, or a Strava export zip here</p>
        <p className="dropzone__hint">or choose files</p>
      </div>
      {signedIn ? null : (
        <div className="dropzone__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSample}
            aria-disabled={busy}
            aria-describedby={busy ? busyHintId : undefined}
          >
            See a sample athlete
          </button>
          {busy && (
            <p id={busyHintId} className="dropzone__busy muted">
              Available when the current import finishes.
            </p>
          )}
        </div>
      )}
      <p className="dropzone__privacy muted">
        {signedIn
          ? 'Analysis runs in your browser. Activity summaries are saved to your library; original files only if you keep them.'
          : 'Your files never leave this device. All analysis runs in your browser.'}
      </p>
      {picker.input}
    </div>
  )
}
