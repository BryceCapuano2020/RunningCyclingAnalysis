import { PlusIcon } from './icons'
import { useFilePicker } from './useFilePicker'

const LABEL = 'Add files'

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
  // The title names the plus-only button on a narrow phone, where the words are hidden.
  return (
    <>
      <button
        type="button"
        className={primary ? 'btn btn-primary' : 'btn'}
        onClick={picker.open}
        title={LABEL}
      >
        <PlusIcon />
        <span className="add-files__label">{LABEL}</span>
      </button>
      {picker.input}
    </>
  )
}
