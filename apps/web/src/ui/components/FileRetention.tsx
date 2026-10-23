import { RETENTION_UNAVAILABLE } from '../analysis/copy'

export interface FileRetentionProps {
  keepFiles: boolean
  fileRetentionAvailable: boolean
  onChange: (keepFiles: boolean) => void
}

/** The signed-in choice to keep original files in the library. */
export function FileRetention({ keepFiles, fileRetentionAvailable, onChange }: FileRetentionProps) {
  return (
    <div className="file-retention">
      <label className="file-retention__choice">
        <input
          type="checkbox"
          checked={keepFiles}
          disabled={!fileRetentionAvailable}
          aria-describedby="file-retention-help"
          onChange={(event) => onChange(event.target.checked)}
        />
        Keep original files in my library
      </label>
      <p id="file-retention-help" className="file-retention__help muted">
        Originals let you rebuild saved analyses later. Turning this off deletes saved originals;
        activity summaries remain.
      </p>
      {!fileRetentionAvailable && <p className="secondary">{RETENTION_UNAVAILABLE}</p>}
    </div>
  )
}
