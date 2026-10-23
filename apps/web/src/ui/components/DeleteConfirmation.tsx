import { useEffect, useId, useRef } from 'react'

export interface DeleteConfirmationProps {
  /** The activity's name, as the question names it. */
  name: string
  busy: boolean
  /** Closes the confirmation without deleting, from Cancel or Escape. */
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Asks before a permanent delete. It takes focus when it opens, Escape cancels from anywhere,
 * and Tab cycles inside it. Mount it with a key per activity, so each question takes focus.
 */
export function DeleteConfirmation({ name, busy, onCancel, onConfirm }: DeleteConfirmationProps) {
  const baseId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    // The dialog is modal in behaviour: Escape closes it from anywhere, and Tab cycles inside it.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || !dialog) return
      const cycle = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
      const first = cycle[0]
      const last = cycle[cycle.length - 1]
      if (first === undefined || last === undefined) return
      // The heading holds focus when the dialog opens. It is not a stop, so it is treated as
      // coming before the first control.
      const index = cycle.findIndex((control) => control === document.activeElement)
      if (event.shiftKey && index <= 0) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (index === -1 || index === cycle.length - 1)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="saved-library__confirmation"
      role="alertdialog"
      aria-labelledby={`${baseId}-confirm-title`}
      aria-describedby={`${baseId}-confirm-description`}
      ref={dialogRef}
    >
      <h3 id={`${baseId}-confirm-title`} tabIndex={-1} ref={headingRef}>
        Delete “{name}”?
      </h3>
      <p id={`${baseId}-confirm-description`}>
        This permanently deletes the activity’s original file and saved summary. This cannot be
        undone.
      </p>
      <div className="saved-library__confirmation-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn saved-library__delete-confirm"
          onClick={() => {
            // aria-disabled, not disabled: a disabled button drops the focus it holds.
            if (!busy) onConfirm()
          }}
          aria-disabled={busy}
        >
          Delete permanently
        </button>
      </div>
    </div>
  )
}
