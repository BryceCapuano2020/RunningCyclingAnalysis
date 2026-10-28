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
  /** Signed out, a saved copy is kept in this browser only, so the question says that instead. */
  signedIn: boolean
  onDelete: (savedId: string) => void
}

/**
 * Removes one saved activity. The question opens under its own button, so it stays with the activity
 * it asks about. Cancel is focused, the safe choice, and Cancel hands focus back to the button.
 */
export function ActivityDelete({ savedId, name, busy, signedIn, onDelete }: ActivityDeleteProps) {
  const [asking, setAsking] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef(false)
  const questionRef = useRef<HTMLDivElement>(null)
  const questionId = useId()
  const noteId = useId()

  useEffect(() => {
    if (asking) {
      cancelRef.current?.focus()
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false
      openRef.current?.focus()
    }
  }, [asking])

  // Escape cancels while the question is open, wherever focus is on the page, unless a removal is running
  // (the question stays until it ends) or another control already used the key. Focus goes back to the
  // Delete button only when it was in the question or nowhere in particular, as the account menu does, so
  // an Escape meant for another control does not pull focus away from it.
  useEffect(() => {
    if (!asking) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy || event.defaultPrevented) return
      const active = document.activeElement
      returnFocusRef.current =
        active === null || active === document.body || !!questionRef.current?.contains(active)
      setAsking(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [asking, busy])

  const removedFrom = signedIn ? 'your library' : 'this browser'
  const cancel = () => {
    returnFocusRef.current = true
    setAsking(false)
  }
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
    <div
      ref={questionRef}
      className="activity-delete__question"
      role="group"
      aria-labelledby={questionId}
    >
      <p id={questionId}>{`Delete “${name}”? It is removed from ${removedFrom}.`}</p>
      {signedIn && <p id={noteId}>Its original file is deleted too, if one is stored.</p>}
      <ConfirmActions
        confirmLabel="Delete"
        busy={busy}
        confirmDescribedBy={signedIn ? `${questionId} ${noteId}` : questionId}
        cancelRef={cancelRef}
        onCancel={cancel}
        onConfirm={() => onDelete(savedId)}
      />
    </div>
  )
}
