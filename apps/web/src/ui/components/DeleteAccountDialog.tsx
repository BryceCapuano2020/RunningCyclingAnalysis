import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError } from '../../api/client'
import { ConfirmActions } from './ConfirmActions'
import { useModalDialog } from './useModalDialog'
import './DeleteAccountDialog.css'

export interface DeleteAccountDialogProps {
  open: boolean
  email: string
  /** The control that opened the dialog, which takes focus back when it closes. */
  opener?: HTMLElement | null
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
 * A confirmation for deleting the account. The confirm button looks unavailable until the user types
 * their email address exactly, but stays focusable so activating it can explain why nothing
 * happened. Escape and Cancel close the dialog, except while a delete is in flight.
 */
export function DeleteAccountDialog({
  open,
  email,
  opener = null,
  onConfirm,
  onClose,
}: DeleteAccountDialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The warning is read first: focus goes to the heading, not the email field, so no keyboard rises.
  const dialogRef = useModalDialog(open, opener, headingRef)
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

  const matches = email !== '' && typed === email

  // A refusal removes the confirm button, so focus moves to the explanation instead of the page.
  useEffect(() => {
    if (failure !== null && !failure.retryable) failureRef.current?.focus()
  }, [failure])

  async function confirmDelete() {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void confirmDelete()
  }

  const retryable = failure === null || failure.retryable

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape goes through onClose so the parent owns the open state.
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <form className="delete-dialog__form" onSubmit={handleSubmit}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>
          Delete your account?
        </h2>
        <p id={bodyId} className="delete-dialog__body">
          This permanently deletes your profile, every activity and every stored file, and this
          browser’s recordings of them. It cannot be undone. Activities and recordings kept in this
          browser from before you signed in are not part of your account, so deleting it does not
          remove them. If you kept any, sign out and choose Remove all my activities to remove them.
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
        <ConfirmActions
          confirmLabel={pending ? 'Deleting…' : 'Delete account'}
          busy={pending}
          unready={!matches}
          confirmDescribedBy={hintId}
          onCancel={onClose}
          onConfirm={retryable ? () => void confirmDelete() : undefined}
        />
      </form>
    </dialog>
  )
}
