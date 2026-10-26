import { useEffect, useId, useRef } from 'react'
import { ConfirmActions } from './ConfirmActions'

export interface DeleteConfirmationProps {
  /** The activity's name, as the question names it. */
  name: string
  /** What the delete removes, said in the words of the list it comes from. */
  description: string
  busy: boolean
  /** The red card for an original file; the neutral card for a summary kept in this browser. */
  critical?: boolean
  /** Closes the confirmation without deleting, from Cancel or Escape. */
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Asks before a delete from the saved list, inline under its row. It is a named group rather than a
 * modal dialog, so the page stays live around it. It takes focus when it opens. Escape cancels from
 * inside the card, or from anywhere while no modal dialog is open. Tab cycles inside the card, and
 * Tab pressed outside it is left to the browser, so a dialog opened over it keeps its own focus.
 * Each row mounts its own, so it takes focus each time it opens.
 */
export function DeleteConfirmation({
  name,
  description,
  busy,
  critical = true,
  onCancel,
  onConfirm,
}: DeleteConfirmationProps) {
  const baseId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // A modal dialog open over this card owns Escape from outside it; from inside, it is ours.
        const target = event.target
        const insideCard = target instanceof Node && dialogRef.current?.contains(target) === true
        if (insideCard || document.querySelector('dialog[open]') === null) onCancel()
        return
      }
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || !dialog) return
      const target = event.target
      if (!(target instanceof Node) || !dialog.contains(target)) return
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
      className={
        critical
          ? 'saved-library__confirmation'
          : 'saved-library__confirmation saved-library__confirmation--quiet'
      }
      role="group"
      aria-labelledby={`${baseId}-confirm-title`}
      aria-describedby={`${baseId}-confirm-description`}
      ref={dialogRef}
    >
      <h3 id={`${baseId}-confirm-title`} tabIndex={-1} ref={headingRef}>
        Delete “<span className="saved-library__confirm-name">{name}</span>”?
      </h3>
      <p id={`${baseId}-confirm-description`}>{description}</p>
      <ConfirmActions confirmLabel="Delete" busy={busy} onCancel={onCancel} onConfirm={onConfirm} />
    </div>
  )
}
