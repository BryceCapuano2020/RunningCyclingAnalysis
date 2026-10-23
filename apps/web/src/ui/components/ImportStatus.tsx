import { useEffect, useRef, useState } from 'react'
import type { ImportOutcome } from '../../worker/protocol'
import { plural } from './plural'
import { isFileDrag } from './useFilePicker'
import './ImportStatus.css'

type Outcome = Pick<ImportOutcome, 'activities' | 'rejected'>

export interface ImportStatusProps {
  /** Receives the files of every drop on the page, including while busy. */
  onFiles: (files: File[]) => void
  busy: boolean
  /** FIT files read so far. Null until the first file is read, since the total is not known. */
  progress: number | null
  /** Signed in, the sync status announces how an import ended, so the outcome is not announced here. */
  signedIn: boolean
  /**
   * Result of the run that just ended. Give a new object per run. Its text is announced when it
   * appears while not busy, unless signed in.
   */
  outcome?: Outcome | null
  /** Neutral reason shown while busy in place of analysis progress, e.g. while imports wait for the library. */
  waiting?: string | null
}

function statusText(progress: number | null): string {
  if (progress === null || progress === 0) return 'Analysing'
  return `Read ${plural(progress, 'file')} so far`
}

/** The one sentence announced when a run ends. Per-file progress is never announced. */
function outcomeSentence({ activities, rejected }: Outcome): string {
  const rejectedText = rejected > 0 ? ` ${plural(rejected, 'file')} could not be used.` : ''
  if (activities === 0) return `No activities were analysed.${rejectedText}`
  return `Analysed ${plural(activities, 'activity', 'activities')}.${rejectedText}`
}

/**
 * Import feedback for the whole page: the drop listeners, the drag overlay, the one live region and
 * the progress strip. Render it once, under the header, so it stays mounted across pages. A region
 * that mounts with its text is not announced, and a window listener must outlive the landing page.
 */
export function ImportStatus({
  onFiles,
  busy,
  progress,
  signedIn,
  outcome = null,
  waiting = null,
}: ImportStatusProps) {
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

  // A file dropped anywhere on the page is read here, and the browser never navigates to it. Text
  // and links are left alone, so they can still be dropped into a field.
  useEffect(() => {
    function handleOver(event: DragEvent) {
      // Required for the page to accept a file drop, and stops the browser opening the file.
      if (isFileDrag(event)) event.preventDefault()
    }
    function handleEnter(event: DragEvent) {
      if (isFileDrag(event)) setWindowDragging(true)
    }
    function handleLeave(event: DragEvent) {
      // relatedTarget is empty when the pointer leaves the window.
      if (!event.relatedTarget) setWindowDragging(false)
    }
    function handleDrop(event: DragEvent) {
      if (!isFileDrag(event)) return
      event.preventDefault()
      setWindowDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) latestOnFiles.current(files)
    }

    window.addEventListener('dragover', handleOver)
    window.addEventListener('dragenter', handleEnter)
    window.addEventListener('dragleave', handleLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleOver)
      window.removeEventListener('dragenter', handleEnter)
      window.removeEventListener('dragleave', handleLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Detect the start and the end of a run during render, not in an effect.
  if (busy !== announcedBusy) {
    setAnnouncedBusy(busy)
    if (busy) setAnnouncement(waiting ?? 'Reading files')
  }
  if (outcome !== announcedOutcome) {
    setAnnouncedOutcome(outcome)
    // Signed in, the sync status announces how the import ended, so this stays silent.
    if (outcome !== null && !busy && !signedIn) setAnnouncement(outcomeSentence(outcome))
  }

  return (
    <>
      {busy && (
        <div className="import-status">
          <div className="import-status__bar" aria-hidden="true">
            <span className="import-status__fill" />
          </div>
          <p className="import-status__text" aria-hidden="true">
            {waiting ?? statusText(progress)}
          </p>
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {windowDragging && <div className="import-status__overlay">Drop to add files</div>}
    </>
  )
}
