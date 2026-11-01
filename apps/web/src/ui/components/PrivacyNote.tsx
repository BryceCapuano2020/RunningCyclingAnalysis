import './PrivacyNote.css'

export interface PrivacyNoteProps {
  signedIn: boolean
  /** Whether the signed-in user keeps original files in the library. */
  keepFiles: boolean
  /** Absent means the API predates capability reporting and file retention is available. */
  fileRetentionAvailable?: boolean
}

/*
 * One sentence for each state. How long recordings are kept, how many fit, and where to remove everything are on the
 * Privacy page, which the footer links to.
 */
function privacyText(
  signedIn: boolean,
  keepFiles: boolean,
  fileRetentionAvailable: boolean,
): string {
  if (!signedIn) return 'Your activities stay in this browser, where anyone using it can see them.'
  if (!fileRetentionAvailable) {
    return 'Summaries are stored in your private library, and original file storage is unavailable here.'
  }
  return keepFiles
    ? 'Summaries and original files are stored in your private library.'
    : 'Summaries are stored in your private library, and original files are not kept.'
}

/** The one-line privacy statement that says what is stored for this visitor. */
export function PrivacyNote({
  signedIn,
  keepFiles,
  fileRetentionAvailable = true,
}: PrivacyNoteProps) {
  return <p className="privacy-note">{privacyText(signedIn, keepFiles, fileRetentionAvailable)}</p>
}
