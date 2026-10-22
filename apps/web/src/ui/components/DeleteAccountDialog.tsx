import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './DeleteAccountDialog.css'

export interface DeleteAccountDialogProps {
  open: boolean
  email: string
  /** Resolves when the account is gone. Rejects when it could not be deleted. */
  onConfirm: () => Promise<void>
  onClose: () => void
}

const HINT = 'Type your email to confirm'

/**
 * A confirmation for deleting the account. The confirm button looks disabled until the user types
 * their email address exactly, but stays focusable so activating it can explain why nothing
 * happened. Escape and Cancel close the dialog, except while a delete is in flight.
 */
export function DeleteAccountDialog({ open, email, onConfirm, onClose }: DeleteAccountDialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  // Each time the dialog closes, forget what was typed. Done during render, not in an effect.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setTyped('')
      setFailed(false)
      setBlocked(false)
    }
  }

  // jsdom has no showModal, so the open attribute stands in for it there.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open && !dialog.hasAttribute('open')) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  const matches = email !== '' && typed === email

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!matches) {
      setBlocked(true)
      return
    }
    setBlocked(false)
    setPending(true)
    setFailed(false)
    try {
      await onConfirm()
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape goes through onClose so the parent owns the open state.
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <form className="delete-dialog__form" onSubmit={handleSubmit}>
        <h2 id={titleId}>Delete your account?</h2>
        <p id={bodyId} className="delete-dialog__body">
          This permanently deletes your profile, every activity and every stored file. It cannot be
          undone.
        </p>
        <p className="delete-dialog__body">
          Your account is <strong>{email}</strong>.
        </p>
        <div className="delete-dialog__field">
          <label htmlFor={inputId}>Email address</label>
          <input
            id={inputId}
            className="delete-dialog__input"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            readOnly={pending}
            aria-describedby={failed ? errorId : undefined}
            onChange={(event) => {
              setFailed(false)
              setBlocked(false)
              setTyped(event.target.value)
            }}
          />
        </div>
        <p
          id={hintId}
          role={blocked ? 'alert' : undefined}
          className={blocked ? 'delete-dialog__error' : 'delete-dialog__hint'}
        >
          {HINT}
        </p>
        {failed && (
          <p id={errorId} role="alert" className="delete-dialog__error">
            Your account could not be deleted. Try again.
          </p>
        )}
        <div className="delete-dialog__actions">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn delete-dialog__confirm"
            aria-disabled={!matches || pending}
            aria-describedby={hintId}
          >
            {pending ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
