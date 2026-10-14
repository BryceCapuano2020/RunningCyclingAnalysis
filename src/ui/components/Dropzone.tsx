import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { plural } from './plural'
import './Dropzone.css'

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  onSample: () => void
  busy: boolean
  /** FIT files read so far. Null until the first file is read, since the total is not known. */
  progress: number | null
  /** Single-row version for use above results: no sample button and no privacy line. */
  compact?: boolean
}

function statusText(progress: number | null): string {
  if (progress === null || progress === 0) return 'Analysing'
  return `Read ${plural(progress, 'file')} so far`
}

export function Dropzone({ onFiles, onSample, busy, progress, compact = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function openPicker() {
    if (!busy) inputRef.current?.click()
  }

  function handleTargetKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPicker()
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Always prevent the default, or the browser navigates to the dropped file.
    event.preventDefault()
    if (!busy) setDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Clear the input so that choosing the same file again still fires a change.
    event.target.value = ''
    if (files.length > 0 && !busy) onFiles(files)
  }

  const className = [
    'dropzone',
    dragging ? 'dropzone--over' : '',
    compact ? 'dropzone--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {compact ? (
        <div className="dropzone__row">
          <button type="button" className="btn" onClick={openPicker} disabled={busy}>
            Add more files
          </button>
        </div>
      ) : (
        <>
          <div
            className="dropzone__target"
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-disabled={busy || undefined}
            onClick={openPicker}
            onKeyDown={handleTargetKey}
          >
            <p className="dropzone__title">Drop FIT files or a Strava export zip here</p>
            <p className="dropzone__hint">or choose files</p>
          </div>
          <div className="dropzone__actions">
            <button type="button" className="btn" onClick={onSample} disabled={busy}>
              Try sample data
            </button>
          </div>
          <p className="dropzone__privacy muted">
            Your files never leave this device. All analysis runs in your browser
          </p>
        </>
      )}
      {busy && (
        <div className="dropzone__bar" aria-hidden="true">
          <span className="dropzone__bar-fill" />
        </div>
      )}
      <p className="dropzone__status" aria-live="polite">
        {busy ? statusText(progress) : ''}
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".fit,.gz,.zip"
        hidden
        disabled={busy}
        onChange={handleInputChange}
      />
    </div>
  )
}
