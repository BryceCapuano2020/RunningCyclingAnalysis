import type { ImportManifest } from '../importManifest'
import { incompleteText } from '../analysis/importIncompleteCopy'

export interface IncompleteImportNoticeProps {
  manifest: ImportManifest
  /** Goes on with what the library holds. */
  onAccept: () => void
}

/**
 * Said when the library is only part of what the athlete added: an import was cut off, or a zip in it is
 * damaged. The results stand; this says what is missing and how to finish. "Use what I have" takes the
 * notice away for good.
 */
export function IncompleteImportNotice({ manifest, onAccept }: IncompleteImportNoticeProps) {
  return (
    <p className="notice" role="status">
      {incompleteText(manifest)}{' '}
      <button type="button" className="btn" onClick={onAccept}>
        Use what I have
      </button>
    </p>
  )
}
