import { useRef, useState } from 'react'
import { ExportGuides } from './ExportGuides'
import { useModalDialog } from './useModalDialog'
import './HowToGetFiles.css'

export interface HowToGetFilesButtonProps {
  /** The button's class, so the page draws it as its one primary action or as a secondary one. */
  className?: string
  /** The button's words. The dialog it opens keeps its own name. */
  label?: string
}

/**
 * Opens the export guides in a dialog, for a page with no room for them, such as an empty Run or
 * Ride card or Profile. The dialog has no sample button: a sample would replace the visitor's data.
 */
export function HowToGetFilesButton({
  className = 'btn',
  label = 'How to get your files',
}: HowToGetFilesButtonProps) {
  const [open, setOpen] = useState(false)
  // The button that opened the guides, which takes focus back when they close.
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, opener, closeRef)

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          setOpener(event.currentTarget)
          setOpen(true)
        }}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="export-guides-dialog"
        aria-label="How to get your files"
        onCancel={(event) => {
          // Escape goes through the state, so the dialog closes the way Close does.
          event.preventDefault()
          setOpen(false)
        }}
      >
        {open && (
          <div className="export-guides-dialog__body">
            <button
              ref={closeRef}
              type="button"
              className="btn export-guides-dialog__close"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
            <ExportGuides />
          </div>
        )}
      </dialog>
    </>
  )
}
