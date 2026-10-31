import { useCallback, useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { READABLE_ACCEPT } from '../readableFiles'

export interface FilePicker {
  /** Opens the system file chooser. */
  open: () => void
  /** The hidden input the chooser belongs to. Render it once, inside the control that opens it. */
  input: ReactElement
}

/**
 * The file chooser behind every control that adds files. It calls onFiles with a non-empty list,
 * and clears its input after each change so the same file can be chosen again.
 *
 * The change is heard on the input itself, not through React, so a choice still counts when the
 * page that holds the input is replaced while the chooser is open (the restoring page gives way to
 * the library when it loads): React hears nothing from an input that has left the page, and the
 * files would be lost. The latest onFiles is called, so the page that replaced it need not be there.
 */
export function useFilePicker(onFiles: (files: File[]) => void): FilePicker {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latest = useRef(onFiles)
  useEffect(() => {
    latest.current = onFiles
  }, [onFiles])

  const attach = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input
    if (input === null || heard.has(input)) return
    heard.add(input)
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? [])
      // Clear the input so that choosing the same file again still fires a change.
      input.value = ''
      if (files.length > 0) latest.current(files)
    })
  }, [])

  return {
    open: () => inputRef.current?.click(),
    input: <input ref={attach} type="file" multiple accept={READABLE_ACCEPT} hidden />,
  }
}

/** The inputs already listened to, so a ref callback that runs again adds no second listener. */
const heard = new WeakSet<HTMLInputElement>()

/** Whether a drag carries files, as opposed to text or a link. The drop targets share it. */
export function isFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
