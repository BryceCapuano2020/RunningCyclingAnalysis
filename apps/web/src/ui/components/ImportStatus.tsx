import { useEffect, useRef, useState } from 'react'
import type { ImportOutcome } from '../../worker/protocol'
import {
  addedSentence,
  importSentence,
  MOVED_NOTE,
  skippedCount,
  skippedSentence,
} from '../analysis/copy'
import type { ImportProgress } from '../analysis/model'
import type { MovedItem } from '../analysis/whatMoved'
import { plural } from './plural'
import { isFileDrag } from './useFilePicker'
import './ImportStatus.css'

type Outcome = Pick<
  ImportOutcome,
  'activities' | 'rejected' | 'duplicates' | 'runs' | 'rides' | 'firstStartMs' | 'lastStartMs'
>

/** Work shorter than this shows neither the busy strip nor its Stop button, so a quick change does not flash them. */
const STRIP_DELAY_MS = 400

export interface ImportStatusProps {
  /** Receives the files of every drop on the page, including while busy. */
  onFiles: (files: File[]) => void
  busy: boolean
  /** Files read so far, with the total when it is known. Null until the first file is read. */
  progress: ImportProgress | null
  /** Signed in, the sync status announces how an import ended, so the outcome is not announced here. */
  signedIn: boolean
  /**
   * Result of the run that just ended. Give a new object per run. Its text is announced when it
   * appears while not busy, unless signed in.
   */
  outcome?: Outcome | null
  /** Neutral reason shown while busy in place of analysis progress, e.g. while imports wait for the library. */
  waiting?: string | null
  /** What the import moved in the athlete's numbers, announced after the outcome. */
  moved?: MovedItem[]
  /** Stops the run. Called with the Stop button, so the page can move focus once the button has gone. */
  onStop?: (control: Element) => void
}

/** The total a count and a bar can use, or null when the import shows its count alone. */
function knownTotal({ filesRead, filesTotal }: ImportProgress): number | null {
  if (filesTotal === null || filesTotal === 0 || filesRead > filesTotal) return null
  return filesTotal
}

function statusText(progress: ImportProgress | null): string {
  if (progress === null || progress.filesRead === 0) return 'Analysing'
  const total = knownTotal(progress)
  if (total === null) return `Read ${plural(progress.filesRead, 'file')} so far`
  const noun = total === 1 ? 'file' : 'files'
  const [read, all] = [progress.filesRead, total].map((count) => count.toLocaleString('en-US'))
  return `Reading ${read} of ${all} ${noun}`
}

/** How far through a known total the import is, as a whole percentage. */
function percentRead(progress: ImportProgress | null): number | null {
  // Until a file is read the bar stays indeterminate, rather than showing an empty measure.
  if (progress === null || progress.filesRead === 0) return null
  const total = knownTotal(progress)
  return total === null ? null : Math.round((progress.filesRead / total) * 100)
}

/** The line announced when a run ends: what it added, what it skipped, and whether the numbers moved. */
function outcomeAnnouncement(outcome: Outcome, moved: MovedItem[]): string {
  const skipped = skippedCount(outcome)
  const skippedText = skipped > 0 ? ` ${skippedSentence(skipped)}` : ''
  // The note goes with a summary sentence only, as the list does.
  const movedNote = moved.length > 0 && addedSentence(outcome) !== null ? ` ${MOVED_NOTE}` : ''
  return `${importSentence(outcome)}${skippedText}${movedNote}`
}

const NO_CHANGES: MovedItem[] = []

/**
 * Import feedback for the whole page: the drop listeners, the drag overlay, the busy strip, and the
 * live region that announces this import's start and end. The strip is fixed to the bottom of the
 * window, so it never moves the page, and it appears only once a run has lasted STRIP_DELAY_MS. The
 * summary of an import is in AppNotices.
 */
export function ImportStatus({
  onFiles,
  busy,
  progress,
  signedIn,
  outcome = null,
  waiting = null,
  moved = NO_CHANGES,
  onStop,
}: ImportStatusProps) {
  const [windowDragging, setWindowDragging] = useState(false)
  // This component's live region: it announces that a run started and how it ended, nothing between.
  const [announcedBusy, setAnnouncedBusy] = useState(busy)
  const [announcedOutcome, setAnnouncedOutcome] = useState(outcome)
  const [announcement, setAnnouncement] = useState('')
  // Whether the run has lasted long enough for the strip and Stop to show.
  const [stripDue, setStripDue] = useState(false)
  const [timedBusy, setTimedBusy] = useState(busy)
  // The window listeners read the latest callback without being rebound on every render.
  const latestOnFiles = useRef(onFiles)

  useEffect(() => {
    latestOnFiles.current = onFiles
  })

  // A run that starts or ends starts the delay again, so the strip waits for each run.
  if (busy !== timedBusy) {
    setTimedBusy(busy)
    setStripDue(false)
  }
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => setStripDue(true), STRIP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [busy])

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

  // Detect the start and the end of a run during render, not in an effect. A run that ends with no
  // outcome, such as a stop or a fault, clears the start's announcement too.
  if (busy !== announcedBusy) {
    setAnnouncedBusy(busy)
    // The run's start is announced, and its end clears that, so "Reading files" does not outlast it.
    setAnnouncement(busy ? (waiting ?? 'Reading files') : '')
  }
  if (outcome !== announcedOutcome) {
    setAnnouncedOutcome(outcome)
    // Signed in, the sync status announces how the import ended, so this stays silent.
    if (outcome !== null && !busy && !signedIn) setAnnouncement(outcomeAnnouncement(outcome, moved))
  }

  const percent = percentRead(progress)
  const showStrip = busy && stripDue

  return (
    <>
      {showStrip && (
        <div className="import-status">
          <div className="import-status__bar" aria-hidden="true">
            <span
              className={
                percent === null
                  ? 'import-status__fill'
                  : 'import-status__fill import-status__fill--measured'
              }
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <p className="import-status__text" aria-hidden="true">
            {waiting ?? statusText(progress)}
          </p>
          <button
            type="button"
            className="btn import-status__stop"
            onClick={(event) => onStop?.(event.currentTarget)}
          >
            Stop current analysis
          </button>
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {windowDragging && <div className="import-status__overlay">Drop to add files</div>}
    </>
  )
}
