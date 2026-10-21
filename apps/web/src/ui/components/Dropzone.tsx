import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent } from 'react'
import { plural } from './plural'
import './Dropzone.css'

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  onSample: () => void
  busy: boolean
  /** FIT files read so far. Null until the first file is read, since the total is not known. */
  progress: number | null
  /** Single inline button for use above results. Drops are accepted anywhere on the page. */
  compact?: boolean
}

function statusText(progress: number | null): string {
  if (progress === null || progress === 0) return 'Analysing'
  return `Read ${plural(progress, 'file')} so far`
}

function isFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

export function Dropzone({ onFiles, onSample, busy, progress, compact = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [windowDragging, setWindowDragging] = useState(false)
  // The window listeners read the latest values without being rebound on every render.
  const latest = useRef({ busy, onFiles })

  useEffect(() => {
    latest.current = { busy, onFiles }
  })

  // Always on, in both modes: a file dropped anywhere on the page is read here, and the browser
  // never navigates to it.
  useEffect(() => {
    function handleOver(event: DragEvent) {
      // Required for the page to accept a drop, and stops the browser opening the file.
      event.preventDefault()
    }
    function handleDrop(event: DragEvent) {
      event.preventDefault()
      setDragging(false)
      setWindowDragging(false)
      const current = latest.current
      if (current.busy) return
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) current.onFiles(files)
    }

    window.addEventListener('dragover', handleOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  // The compact toolbar shows an overlay while files are dragged over the window.
  useEffect(() => {
    if (!compact) return

    function handleEnter(event: DragEvent) {
      if (!isFileDrag(event)) return
      setWindowDragging(true)
    }
    function handleLeave(event: DragEvent) {
      // relatedTarget is empty when the pointer leaves the window.
      if (!event.relatedTarget) setWindowDragging(false)
    }

    window.addEventListener('dragenter', handleEnter)
    window.addEventListener('dragleave', handleLeave)
    return () => {
      window.removeEventListener('dragenter', handleEnter)
      window.removeEventListener('dragleave', handleLeave)
    }
  }, [compact])

  function openPicker() {
    if (!busy) inputRef.current?.click()
  }

  function handleTargetKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPicker()
    }
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    // Always prevent the default, or the browser navigates to the dropped file.
    event.preventDefault()
    if (!busy && isFileDrag(event)) setDragging(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDragging(false)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Clear the input so that choosing the same file again still fires a change.
    event.target.value = ''
    if (files.length > 0 && !busy) onFiles(files)
  }

  const status = busy ? statusText(progress) : ''
  const bar = busy && (
    <div className="dropzone__bar" aria-hidden="true">
      <span className="dropzone__bar-fill" />
    </div>
  )

  if (compact) {
    return (
      <div className="dropzone dropzone--compact">
        <button type="button" className="btn" onClick={openPicker} disabled={busy}>
          Add more files
        </button>
        {bar}
        <p className="dropzone__status" aria-live="polite">
          {status}
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
        {windowDragging && !busy && <div className="dropzone__overlay">Drop to add files</div>}
      </div>
    )
  }

  return (
    <div
      className={dragging ? 'dropzone dropzone--over' : 'dropzone'}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
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
      {bar}
      <p className="dropzone__status" aria-live="polite">
        {status}
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
