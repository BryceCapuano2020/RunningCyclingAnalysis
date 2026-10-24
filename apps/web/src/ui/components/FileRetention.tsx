import { useState } from 'react'
import { RETENTION_UNAVAILABLE, SAVE_STATE_TEXT } from '../analysis/copy'
import { useSaveStatus } from '../useSaveStatus'
import { ConfirmDialog } from './ConfirmDialog'
import { plural } from './plural'

export interface FileRetentionProps {
  keepFiles: boolean
  fileRetentionAvailable: boolean
  /** Original files stored in the library, or null while the library has not loaded. */
  storedFiles: number | null
  /** Whether the turn-off question is open. The page holds it, so it can close what else is open. */
  asking: boolean
  onAskingChange: (asking: boolean) => void
  /** Resolves when the change is saved. Rejects when it is not, and the saved value stays. */
  onChange: (keepFiles: boolean) => Promise<void>
}

const KEEPING = 'Saved. Original files will be kept in your library.'
const KEEP_AFTER = 'New files will not be kept until you turn this back on.'

/** The stored originals a turn-off deletes, said as the confirmation names them. */
function removedNoun(storedFiles: number | null): string | null {
  if (storedFiles === null) return 'any stored original files'
  if (storedFiles === 0) return null
  return plural(storedFiles, 'stored original file', 'stored original files')
}

function offDescription(storedFiles: number | null): string {
  const removed = removedNoun(storedFiles)
  return removed === null
    ? `No original files are stored. Activity summaries stay. ${KEEP_AFTER}`
    : `This deletes ${removed}. Activity summaries stay. ${KEEP_AFTER}`
}

function offOutcome(storedFiles: number | null): string {
  if (storedFiles === null) return 'Saved. Original files are off; summaries stay.'
  if (storedFiles === 0) return 'Saved. Original files are off. Summaries stay.'
  const were = storedFiles === 1 ? 'was deleted' : 'were deleted'
  return `Saved. Original files are off. ${plural(storedFiles, 'stored original file', 'stored original files')} ${were}; summaries stay.`
}

/**
 * The signed-in choice to keep original files in the library. Turning it on saves at once. Turning
 * it off first asks, because it deletes every stored original; the outcome says what was removed.
 */
export function FileRetention({
  keepFiles,
  fileRetentionAvailable,
  storedFiles,
  asking,
  onAskingChange,
  onChange,
}: FileRetentionProps) {
  const { states, save } = useSaveStatus<'keep'>()
  // The value being saved. The control shows it at once, and falls back to the saved value if the
  // save fails.
  const [pendingKeep, setPendingKeep] = useState<boolean | null>(null)
  const [outcome, setOutcome] = useState('')
  // The checkbox that asked for the turn-off, which takes focus back when the question closes.
  const [opener, setOpener] = useState<HTMLElement | null>(null)

  async function change(next: boolean) {
    setPendingKeep(next)
    const saved = await save('keep', () => onChange(next))
    setPendingKeep(null)
    setOutcome(saved ? (next ? KEEPING : offOutcome(storedFiles)) : '')
  }

  const statusText =
    states.keep === 'saving'
      ? SAVE_STATE_TEXT.saving
      : states.keep === 'failed'
        ? SAVE_STATE_TEXT.failed
        : outcome

  return (
    <div className="file-retention">
      <label className="file-retention__choice">
        <input
          type="checkbox"
          checked={pendingKeep ?? keepFiles}
          disabled={!fileRetentionAvailable}
          aria-describedby="file-retention-help"
          onChange={(event) => {
            if (pendingKeep !== null) return
            if (event.target.checked) {
              void change(true)
            } else {
              setOpener(event.currentTarget)
              onAskingChange(true)
            }
          }}
        />
        Keep original files in my library
      </label>
      <p id="file-retention-help" className="file-retention__help muted">
        Originals let you rebuild saved analyses later. Turning this off deletes saved originals;
        activity summaries remain.
      </p>
      <p role="status" className="file-retention__status secondary">
        {statusText}
      </p>
      {!fileRetentionAvailable && <p className="secondary">{RETENTION_UNAVAILABLE}</p>}
      <ConfirmDialog
        open={asking}
        title="Turn off keeping original files?"
        description={offDescription(storedFiles)}
        confirmLabel={storedFiles === 0 ? 'Turn off' : 'Turn off and delete'}
        opener={opener}
        onConfirm={() => {
          onAskingChange(false)
          void change(false)
        }}
        onClose={() => onAskingChange(false)}
      />
    </div>
  )
}
