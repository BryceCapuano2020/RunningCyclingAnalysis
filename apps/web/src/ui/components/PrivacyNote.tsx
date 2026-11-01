import './PrivacyNote.css'

export interface PrivacyNoteProps {
  signedIn: boolean
  /** Whether the signed-in user keeps original files in the library. */
  keepFiles: boolean
  /** Absent means the API predates capability reporting and file retention is available. */
  fileRetentionAvailable?: boolean
  /** Whether Profile offers "Remove all my activities" now: signed out, with activities kept in this browser. */
  removable: boolean
}

function privacyText(
  signedIn: boolean,
  keepFiles: boolean,
  fileRetentionAvailable: boolean,
  removable: boolean,
): string {
  if (!signedIn) {
    const removal = removable ? ' Remove all my activities, on Profile, removes them.' : ''
    return `Nothing is uploaded; analysis runs in your browser. Summaries and detailed recordings are kept in this browser where it allows, so anyone using it can see them. Recordings fit in about 64 MiB, and those of the oldest activities are dropped first.${removal}`
  }
  if (!fileRetentionAvailable) {
    return 'Your activity summaries are stored in your private library. Original file storage is unavailable here, so new files are not kept; existing saved originals are not deleted. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.'
  }
  if (keepFiles) {
    return 'Your activity summaries and original files are stored in your private library. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.'
  }
  return 'Your activity summaries are stored in your private library; original files are not kept. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.'
}

/** The one-line privacy statement that says exactly what is stored for this visitor. */
export function PrivacyNote({
  signedIn,
  keepFiles,
  fileRetentionAvailable = true,
  removable,
}: PrivacyNoteProps) {
  return (
    <p className="privacy-note">
      {privacyText(signedIn, keepFiles, fileRetentionAvailable, removable)}
    </p>
  )
}
