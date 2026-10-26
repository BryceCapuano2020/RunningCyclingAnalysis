import { NARROW_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { useNarrowScreen } from '../useNarrowScreen'
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
  // At the narrow phone the words are hidden and the button is the plus only, so it names itself.
  const plusOnly = useNarrowScreen(NARROW_PHONE_MAX_WIDTH_PX)
  return (
    <>
      <button
        type="button"
        className={primary ? 'btn btn-primary' : 'btn'}
        onClick={picker.open}
        title={plusOnly ? LABEL : undefined}
      >
        <PlusIcon />
        <span className="add-files__label">{LABEL}</span>
      </button>
      {picker.input}
    </>
  )
}
