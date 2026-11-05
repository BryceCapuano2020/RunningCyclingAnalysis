import { useFilePicker } from './useFilePicker'

const LABEL = 'Add files'

export interface AddFilesButtonProps {
  onFiles: (files: File[]) => void
  /** Drawn as the screen's primary action. Off where another control is primary. */
  primary?: boolean
}

/**
 * The header's one import control: the words "Add files" at every width, with no icon, small and solid ink as the
 * screen's primary action. It is never disabled: a file chosen during a load is queued, as a dropped file is.
 */
export function AddFilesButton({ onFiles, primary = true }: AddFilesButtonProps) {
  const picker = useFilePicker(onFiles)
  return (
    <>
      <button
        type="button"
        className={primary ? 'btn btn-primary add-files' : 'btn add-files'}
        onClick={picker.open}
      >
        {LABEL}
      </button>
      {picker.input}
    </>
  )
}
