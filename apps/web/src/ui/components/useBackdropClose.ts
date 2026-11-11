import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Closes a modal dialog on a click on its backdrop. Such a click lands on the dialog itself, not on anything inside it, and so
 * does a click on its padding, so the dialog's box decides: a click outside it closes.
 */
export function useBackdropClose(
  dialogRef: RefObject<HTMLDialogElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target !== dialog) return
      const box = dialog.getBoundingClientRect()
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      if (!inside) close()
    }
    dialog.addEventListener('click', closeOnBackdrop)
    return () => dialog.removeEventListener('click', closeOnBackdrop)
  })
}
