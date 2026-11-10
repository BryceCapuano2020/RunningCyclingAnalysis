import './PrivacyNote.css'
import { privacyText } from './privacyText'
import type { PrivacyNoteProps } from './privacyText'

export type { PrivacyNoteProps } from './privacyText'

/** The one-line privacy statement, shown only when it says something the visitor needs: see privacyText. */
export function PrivacyNote(props: PrivacyNoteProps) {
  const text = privacyText(props)
  return text === null ? null : <p className="privacy-note">{text}</p>
}
