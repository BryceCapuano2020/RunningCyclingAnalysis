import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent } from 'react'
import { plural } from './plural'
import './Dropzone.css'

/** What a finished run produced, announced once when it ends. */
export interface DropzoneOutcome {
  activities: number
  /** Files that could not be read or used. */
  rejected: number
}

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  onSample: () => void
  busy: boolean
  /** FIT files read so far. Null until the first file is read, since the total is not known. */
  progress: number | null
  /** Single inline button for use above results. Drops are accepted anywhere on the page. */
  compact?: boolean
  /** Signed-in imports are saved to the library, so the copy and the sample button change. */
  signedIn: boolean
  /** Result of the run that just ended. Give a new object per run; its text is announced when it appears while not busy. */
  outcome?: DropzoneOutcome | null
  /** Neutral reason shown while busy in place of analysis progress, e.g. while imports wait for the library. */
  waiting?: string | null
}

function statusText(progress: number | null): string {
  if (progress === null || progress === 0) return 'Analysing'
  return `Read ${plural(progress, 'file')} so far`
}

/** The one sentence announced when a run ends. Per-file progress is never announced. */
function outcomeSentence({ activities, rejected }: DropzoneOutcome): string {
  const rejectedText = rejected > 0 ? ` ${plural(rejected, 'file')} could not be used.` : ''
  if (activities === 0) return `No activities were analysed.${rejectedText}`
  return `Analysed ${plural(activities, 'activity', 'activities')}.${rejectedText}`
}

function isFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Files are accepted even while busy: the analysis worker handles requests in order, so a file
 * chosen during a load is queued rather than lost. Only the sample stays off while busy.
 */
export function Dropzone({
  onFiles,
  onSample,
  busy,
  progress,
  compact = false,
  signedIn,
  outcome = null,
  waiting = null,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [windowDragging, setWindowDragging] = useState(false)
  // The one live region: announces that a run started and how it ended, and nothing in between.
  const [announcedBusy, setAnnouncedBusy] = useState(busy)
  const [announcedOutcome, setAnnouncedOutcome] = useState(outcome)
  const [announcement, setAnnouncement] = useState('')
  // The window listeners read the latest callback without being rebound on every render.
  const latestOnFiles = useRef(onFiles)

  useEffect(() => {
    latestOnFiles.current = onFiles
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
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) latestOnFiles.current(files)
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
    inputRef.current?.click()
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
    if (isFileDrag(event)) setDragging(true)
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
    if (files.length > 0) onFiles(files)
  }

  // Detect the start and the end of a run during render, not in an effect.
  if (busy !== announcedBusy) {
    setAnnouncedBusy(busy)
    if (busy) setAnnouncement(waiting ?? 'Reading files')
  }
  if (outcome !== announcedOutcome) {
    setAnnouncedOutcome(outcome)
    if (outcome !== null && !busy) setAnnouncement(outcomeSentence(outcome))
  }

  const status = busy ? (waiting ?? statusText(progress)) : ''
  const liveRegion = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  )
  const bar = busy && (
    <div className="dropzone__bar" aria-hidden="true">
      <span className="dropzone__bar-fill" />
    </div>
  )

  if (compact) {
    return (
      <div className="dropzone dropzone--compact">
        <button type="button" className="btn" onClick={openPicker}>
          Add more files
        </button>
        {bar}
        <p className="dropzone__status" aria-hidden="true">
          {status}
        </p>
        {liveRegion}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".fit,.gz,.zip"
          hidden
          onChange={handleInputChange}
        />
        {windowDragging && <div className="dropzone__overlay">Drop to add files</div>}
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
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={handleTargetKey}
      >
        <p className="dropzone__title">Drop FIT files or a Strava export zip here</p>
        <p className="dropzone__hint">or choose files</p>
      </div>
      {signedIn ? null : (
        <div className="dropzone__actions">
          <button type="button" className="btn" onClick={onSample} disabled={busy}>
            Try sample data
          </button>
        </div>
      )}
      <p className="dropzone__privacy muted">
        {signedIn
          ? 'Analysis runs in your browser. Activity summaries are saved to your library; original files only if you keep them.'
          : 'Your files never leave this device. All analysis runs in your browser.'}
      </p>
      {bar}
      <p className="dropzone__status" aria-hidden="true">
        {status}
      </p>
      {liveRegion}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".fit,.gz,.zip"
        hidden
        onChange={handleInputChange}
      />
    </div>
  )
}
