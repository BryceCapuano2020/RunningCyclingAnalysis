import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { RejectedFile } from '@rca/core/session'
import type { ImportOutcome } from '../../worker/protocol'
import { addedSentence, importSentence } from '../analysis/copy'
import type { MovedItem } from '../analysis/whatMoved'
import { PAGE_HEADING_ID } from '../pages/pageHeading'
import { hrefFor } from '../route'
import { NoticeLine } from './NoticeLine'
import { RejectedFiles } from './RejectedFiles'
import './ImportNotice.css'

export interface ImportNoticeProps {
  /** The result of the last import. Null when there is no summary to show. */
  outcome: ImportOutcome | null
  /** While an import runs its summary is hidden: the result of the run before it is not the one on screen. */
  busy: boolean
  /** Files the last import could not use, and the activity files of a format the app does not read. */
  rejected: RejectedFile[]
  unsupportedFiles: number
  /** What the import moved in the athlete's numbers, listed under the sentence. */
  moved: MovedItem[]
  /** On the Balance page the link to it would point at the page it is already on, so it is left out. */
  atBalance: boolean
  /** Said under the sentence when the runs it added are all left out at walking pace, so "Added 22 runs" is not left alone. */
  leftOutLine?: ReactNode
  /** Where detailed readings stop for the older activities, when they do; null when every activity has them. */
  detailLine?: { short: string; full: string } | null
  /** Called when the summary is dismissed, so the page can drop what moved with it. */
  onDismiss: () => void
  /** Takes off the labels the import applied, for an import that applied some. */
  onUndoLabels?: () => void
}

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
 * The summary of the last import, in the notice region under the header. It is dismissed per import,
 * so a new import's summary shows again. Its sentence is the one the page announces.
 */
export function ImportNotice({
  outcome,
  busy,
  rejected,
  unsupportedFiles,
  moved,
  atBalance,
  detailLine = null,
  leftOutLine = null,
  onDismiss,
  onUndoLabels,
}: ImportNoticeProps) {
  const [dismissed, setDismissed] = useState<ImportOutcome | null>(null)
  if (outcome === null || outcome === dismissed || busy) return null
  // What moved is listed only for an import that added a run or a ride, as the sentence says it did.
  const listMoved = moved.length > 0 && addedSentence(outcome) !== null

  function dismiss(event: MouseEvent<HTMLButtonElement>) {
    setDismissed(outcome)
    onDismiss()
    // The button leaves with the notice, so focus that was on it moves to the page heading.
    if (document.activeElement === event.currentTarget) {
      document.getElementById(PAGE_HEADING_ID)?.focus({ preventScroll: true })
    }
  }

  function undo(event: MouseEvent<HTMLButtonElement>) {
    onUndoLabels?.()
    // The button leaves with the labels it undoes, so focus that was on it moves to the page heading.
    if (document.activeElement === event.currentTarget) {
      document.getElementById(PAGE_HEADING_ID)?.focus({ preventScroll: true })
    }
  }

  return (
    <div className="import-notice">
      <div className="import-notice__body">
        <p>{importSentence(outcome)}</p>
        {leftOutLine !== null && <p className="secondary">{leftOutLine}</p>}
        {listMoved && (
          <ul className="import-notice__moved">
            {moved.map((item) => (
              <li key={item.text}>{movedText(item)}</li>
            ))}
          </ul>
        )}
        {detailLine !== null && (
          <div className="import-notice__detail">
            <NoticeLine short={detailLine.short}>{detailLine.full}</NoticeLine>
          </div>
        )}
        <RejectedFiles outcome={outcome} rejected={rejected} unsupportedFiles={unsupportedFiles} />
      </div>
      {onUndoLabels !== undefined && (outcome.labelled ?? 0) > 0 && (
        <button type="button" className="btn" onClick={undo}>
          Undo the labels
        </button>
      )}
      {atBalance ? null : <a href={hrefFor({ page: 'balance' })}>See your balance</a>}
      <button type="button" className="btn" onClick={dismiss}>
        Dismiss summary
      </button>
    </div>
  )
}
