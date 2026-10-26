import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmActions } from './ConfirmActions'
import './ActivityDelete.css'

export interface ActivityDeleteProps {
  /** The saved copy this removes. */
  savedId: string
  /** The activity's name, which the button and the question both give. */
  name: string
  /** A removal is already running, so the question cannot be opened or confirmed. */
  busy: boolean
  onDelete: (savedId: string) => void
}

/**
 * Removes one saved activity. The question opens under its own button, so it stays with the activity
 * it asks about. Cancel is focused, the safe choice, and Cancel hands focus back to the button.
 */
export function ActivityDelete({ savedId, name, busy, onDelete }: ActivityDeleteProps) {
  const [asking, setAsking] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef(false)
  const questionId = useId()

  useEffect(() => {
    if (asking) {
      cancelRef.current?.focus()
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false
      openRef.current?.focus()
    }
  }, [asking])

  if (!asking) {
    return (
      <button
        ref={openRef}
        type="button"
        className="btn activity-delete__open"
        aria-disabled={busy}
        aria-label={`Delete ${name}`}
        onClick={() => {
          if (!busy) setAsking(true)
        }}
      >
        Delete
      </button>
    )
  }

  return (
    <div className="activity-delete__question" role="group" aria-labelledby={questionId}>
      <p id={questionId}>{`Delete ${name}? It is removed from your library.`}</p>
      <ConfirmActions
        confirmLabel="Delete"
        busy={busy}
        confirmDescribedBy={questionId}
        cancelRef={cancelRef}
        onCancel={() => {
          returnFocusRef.current = true
          setAsking(false)
        }}
        onConfirm={() => onDelete(savedId)}
      />
    </div>
  )
}
