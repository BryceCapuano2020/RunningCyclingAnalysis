import './PrivacyNote.css'
import { privacyText } from './privacyText'
import type { PrivacyNoteProps } from './privacyText'

export type { PrivacyNoteProps } from './privacyText'

/** The one-line privacy statement that says what is stored for this visitor. */
export function PrivacyNote(props: PrivacyNoteProps) {
  return <p className="privacy-note">{privacyText(props)}</p>
}
