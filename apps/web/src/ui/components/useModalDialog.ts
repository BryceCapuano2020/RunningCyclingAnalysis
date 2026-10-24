import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Opens and closes a native modal dialog from its `open` state. When it opens, focus goes to
 * `initialFocus` if one is given. When it closes, focus goes back to the control that opened it,
 * which the caller passes in, rather than to whatever happened to hold focus. jsdom has no
 * showModal, so the open attribute stands in for it there.
 */
export function useModalDialog(
  open: boolean,
  opener: HTMLElement | null,
  initialFocus?: RefObject<HTMLElement | null>,
): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open && !dialog.hasAttribute('open')) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      initialFocus?.current?.focus()
    } else if (!open && dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      if (opener?.isConnected) opener.focus()
    }
  }, [open, opener, initialFocus])

  return dialogRef
}
