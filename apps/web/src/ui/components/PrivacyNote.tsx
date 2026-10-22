import './PrivacyNote.css'

export interface PrivacyNoteProps {
  signedIn: boolean
  /** Whether the signed-in user keeps original files in the library. */
  keepFiles: boolean
}

function privacyText(signedIn: boolean, keepFiles: boolean): string {
  if (!signedIn) return 'Nothing is uploaded. Files are read and analysed in your browser only.'
  if (keepFiles) {
    return 'Your activity summaries and original files are stored in your private library. Analysis runs in your browser.'
  }
  return 'Your activity summaries are stored in your private library; original files stay on this device. Analysis runs in your browser.'
}

/** The one-line privacy statement that says exactly what is stored for this visitor. */
export function PrivacyNote({ signedIn, keepFiles }: PrivacyNoteProps) {
  return <p className="privacy-note">{privacyText(signedIn, keepFiles)}</p>
}
