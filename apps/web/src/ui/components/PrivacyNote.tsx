import './PrivacyNote.css'

export interface PrivacyNoteProps {
  signedIn: boolean
  /** Whether the signed-in user keeps original files in the library. */
  keepFiles: boolean
  /** Absent means the API predates capability reporting and file retention is available. */
  fileRetentionAvailable?: boolean
}

function privacyText(
  signedIn: boolean,
  keepFiles: boolean,
  fileRetentionAvailable: boolean,
): string {
  if (!signedIn) {
    return 'Nothing is uploaded; analysis runs in your browser. Summaries and recent detailed recordings are kept in this browser where it allows, so anyone using it can see them. Remove all my activities removes them.'
  }
  if (!fileRetentionAvailable) {
    return 'Your activity summaries are stored in your private library. Original file storage is unavailable here, so new files are not kept; existing saved originals are not deleted. Analysis runs in your browser, which also keeps recent detailed recordings.'
  }
  if (keepFiles) {
    return 'Your activity summaries and original files are stored in your private library. Analysis runs in your browser, which also keeps recent detailed recordings.'
  }
  return 'Your activity summaries are stored in your private library; original files are not kept. Analysis runs in your browser, which also keeps recent detailed recordings.'
}

/** The one-line privacy statement that says exactly what is stored for this visitor. */
export function PrivacyNote({
  signedIn,
  keepFiles,
  fileRetentionAvailable = true,
}: PrivacyNoteProps) {
  return <p className="privacy-note">{privacyText(signedIn, keepFiles, fileRetentionAvailable)}</p>
}
