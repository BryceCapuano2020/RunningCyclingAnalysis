import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError } from '../../api/client'
import './DeleteAccountDialog.css'

export interface DeleteAccountDialogProps {
  open: boolean
  email: string
  /** Resolves when the account is gone. Rejects when it could not be deleted. */
  onConfirm: () => Promise<void>
  onClose: () => void
}

const HINT = 'Type your email to confirm'
const MISMATCH = 'The email does not match yet.'

interface Failure {
  message: string
  /** Whether trying again can succeed. A refused request will be refused again. */
  retryable: boolean
}

const UNEXPECTED_FAILURE: Failure = {
  message: 'Your account could not be deleted. Try again.',
  retryable: true,
}

/** Shows the server's own message. Only unavailability and transport errors can clear on retry. */
function failureFrom(error: unknown): Failure {
  if (!(error instanceof ApiRequestError)) return UNEXPECTED_FAILURE
  const retryable =
    error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
  return { message: error.message, retryable }
}

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
  const failureRef = useRef<HTMLParagraphElement>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  // Each time the dialog closes, forget what was typed. Done during render, not in an effect.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setTyped('')
      setFailure(null)
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

  // A refusal removes the confirm button, so focus moves to the explanation instead of the page.
  useEffect(() => {
    if (failure !== null && !failure.retryable) failureRef.current?.focus()
  }, [failure])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || (failure !== null && !failure.retryable)) return
    if (!matches) {
      setBlocked(true)
      return
    }
    setBlocked(false)
    setPending(true)
    setFailure(null)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      setFailure(failureFrom(error))
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
            aria-describedby={failure ? errorId : undefined}
            onChange={(event) => {
              // A refused request stays explained: editing the email cannot make it succeed.
              setFailure((current) => (current?.retryable === false ? current : null))
              setBlocked(false)
              setTyped(event.target.value)
            }}
          />
        </div>
        {/* Always a status region, so the explanation is announced when it appears. */}
        <p
          id={hintId}
          role="status"
          className={blocked ? 'delete-dialog__error' : 'delete-dialog__hint'}
        >
          {blocked ? `${HINT}. ${MISMATCH}` : HINT}
        </p>
        {failure && (
          <p
            ref={failureRef}
            id={errorId}
            role="alert"
            tabIndex={-1}
            className="delete-dialog__error"
          >
            {failure.message}
          </p>
        )}
        <div className="delete-dialog__actions">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          {failure === null || failure.retryable ? (
            <button
              type="submit"
              className="btn delete-dialog__confirm"
              aria-disabled={!matches || pending}
              aria-describedby={hintId}
            >
              {pending ? 'Deleting…' : 'Delete account'}
            </button>
          ) : null}
        </div>
      </form>
    </dialog>
  )
}
