import type { Sport } from '@rca/core/types'
import { SPORT_PLURAL } from '../sports'
import { useFilePicker } from './useFilePicker'

export interface AddSportFilesProps {
  sport: Sport
  /** Adds files, as the header's Add files does. */
  onAddFiles: (files: File[]) => void
}

/**
 * The action on a page or card with none of one sport: it opens the same file chooser as the header.
 * It is secondary, since the header holds the one primary action on the screen.
 */
export function AddSportFiles({ sport, onAddFiles }: AddSportFilesProps) {
  const picker = useFilePicker(onAddFiles)
  return (
    <div>
      <button type="button" className="btn" onClick={picker.open}>
        {`Add ${SPORT_PLURAL[sport]}`}
      </button>
      {picker.input}
    </div>
  )
}
