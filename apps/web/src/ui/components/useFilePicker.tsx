import { useRef } from 'react'
import type { ChangeEvent, ReactElement } from 'react'

export interface FilePicker {
  /** Opens the system file chooser. */
  open: () => void
  /** The hidden input the chooser belongs to. Render it once, inside the control that opens it. */
  input: ReactElement
}

/**
 * The file chooser behind every control that adds files. It calls onFiles with a non-empty list,
 * and clears its input after each change so the same file can be chosen again.
 */
export function useFilePicker(onFiles: (files: File[]) => void): FilePicker {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Clear the input so that choosing the same file again still fires a change.
    event.target.value = ''
    if (files.length > 0) onFiles(files)
  }

  return {
    open: () => inputRef.current?.click(),
    input: (
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".fit,.gpx,.tcx,.gz,.zip"
        hidden
        onChange={handleChange}
      />
    ),
  }
}

/** Whether a drag carries files, as opposed to text or a link. The drop targets share it. */
export function isFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
