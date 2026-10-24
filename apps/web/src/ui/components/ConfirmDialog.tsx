import { useId, useRef } from 'react'
import { ConfirmActions } from './ConfirmActions'
import { useModalDialog } from './useModalDialog'
import './ConfirmDialog.css'

export interface ConfirmDialogProps {
  open: boolean
  /** The question, which names what the action removes. */
  title: string
  /** What the action does, said before the buttons. */
  description: string
  /** Names the action, such as "Remove all". */
  confirmLabel: string
  /** The control that opened the dialog, which takes focus back when it closes. */
  opener: HTMLElement | null
  /** Runs from the confirm button. The parent closes the dialog. */
  onConfirm: () => void
  /** Runs from Cancel or Escape. The parent closes the dialog. */
  onClose: () => void
}

/**
 * A modal confirmation for an action that removes data. Cancel has focus when it opens, so a stray
 * Enter cannot confirm. When it closes, focus goes back to the opener the parent passed in, which
 * is the control the user pressed, rather than whatever happened to hold focus.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  opener,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, opener, cancelRef)

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape goes through onClose so the parent owns the open state.
        event.preventDefault()
        onClose()
      }}
    >
      {open && (
        <div className="confirm-dialog__body">
          <h2 id={titleId}>{title}</h2>
          <p id={bodyId}>{description}</p>
          <ConfirmActions
            confirmLabel={confirmLabel}
            cancelRef={cancelRef}
            onCancel={onClose}
            onConfirm={onConfirm}
          />
        </div>
      )}
    </dialog>
  )
}
