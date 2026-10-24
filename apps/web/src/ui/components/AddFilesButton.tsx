import { PlusIcon } from './icons'
import { useFilePicker } from './useFilePicker'

export interface AddFilesButtonProps {
  onFiles: (files: File[]) => void
  /** Drawn as the screen's primary action. Off where another control is primary. */
  primary?: boolean
}

/**
 * The header's one import control. It is never disabled: a file chosen during a load is queued,
 * as a dropped file is.
 */
export function AddFilesButton({ onFiles, primary = true }: AddFilesButtonProps) {
  const picker = useFilePicker(onFiles)
  return (
    <>
      <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={picker.open}>
        <PlusIcon />
        <span className="add-files__label">Add files</span>
      </button>
      {picker.input}
    </>
  )
}
