import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ImportOutcome } from '../../worker/protocol'
import { addedSentence, MOVED_NOTE } from '../analysis/copy'
import type { ImportProgress } from '../analysis/model'
import type { MovedItem } from '../analysis/whatMoved'
import { PAGE_HEADING_ID } from '../pages/pageHeading'
import { hrefFor } from '../route'
import { plural } from './plural'
import { isFileDrag } from './useFilePicker'
import './ImportStatus.css'

type Outcome = Pick<
  ImportOutcome,
  'activities' | 'rejected' | 'runs' | 'rides' | 'firstStartMs' | 'lastStartMs'
>

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
  /** On the Balance page the summary's link would point at the page it is already on, so it is left out. */
  atBalance?: boolean
  /** What the import moved in the athlete's numbers, listed under the summary and announced. */
  moved?: MovedItem[]
  /** Called when the summary is dismissed, so the page can drop what moved with it. */
  onDismiss?: () => void
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

/** The one sentence announced when a run ends. Per-file progress is never announced. */
function outcomeSentence(outcome: Outcome): string {
  const rejectedText =
    outcome.rejected > 0 ? ` ${plural(outcome.rejected, 'file')} could not be used.` : ''
  const added = addedSentence(outcome)
  if (added !== null) return `${added}${rejectedText}`
  if (outcome.activities === 0) return `No activities were analysed.${rejectedText}`
  return `Analysed ${plural(outcome.activities, 'activity', 'activities')}.${rejectedText}`
}

const NO_CHANGES: MovedItem[] = []

/** A change as text, with the arrow hidden from screen readers in favour of the spoken form. */
function movedText({ text, spoken }: MovedItem) {
  if (spoken === undefined) return text
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
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
  atBalance = false,
  moved = NO_CHANGES,
  onDismiss,
}: ImportStatusProps) {
  const [windowDragging, setWindowDragging] = useState(false)
  // The one live region: announces that a run started and how it ended, and nothing in between.
  const [announcedBusy, setAnnouncedBusy] = useState(busy)
  const [announcedOutcome, setAnnouncedOutcome] = useState(outcome)
  // The summary of a run stays until it is dismissed; a new run's outcome brings it back.
  const [dismissedOutcome, setDismissedOutcome] = useState<Outcome | null>(null)
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
    if (outcome !== null && !busy && !signedIn) {
      // The note goes with a summary sentence only, as the list does.
      const movedNote = moved.length > 0 && addedSentence(outcome) !== null ? ` ${MOVED_NOTE}` : ''
      setAnnouncement(`${outcomeSentence(outcome)}${movedNote}`)
    }
  }

  const summary =
    outcome !== null && outcome !== dismissedOutcome && !busy ? addedSentence(outcome) : null
  const percent = percentRead(progress)

  function dismiss(event: MouseEvent<HTMLButtonElement>) {
    setDismissedOutcome(outcome)
    onDismiss?.()
    // The button leaves with the notice, so focus that was on it moves to the page heading.
    if (document.activeElement === event.currentTarget) {
      document.getElementById(PAGE_HEADING_ID)?.focus({ preventScroll: true })
    }
  }

  return (
    <>
      {busy && (
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
        </div>
      )}
      {summary !== null && (
        <div className="import-status__notice">
          <div className="import-status__body">
            <p>{summary}</p>
            {moved.length > 0 && (
              <ul className="import-status__moved">
                {moved.map((item) => (
                  <li key={item.text}>{movedText(item)}</li>
                ))}
              </ul>
            )}
          </div>
          {atBalance ? null : <a href={hrefFor({ page: 'balance' })}>See your balance</a>}
          <button type="button" className="btn" onClick={dismiss}>
            Dismiss import summary
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
