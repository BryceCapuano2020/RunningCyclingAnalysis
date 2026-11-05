import { hrefFor } from '../route'
import { PrivacyNote } from './PrivacyNote'
import type { PrivacyNoteProps } from './PrivacyNote'

/** The foot of every page: the privacy sentence for the visitor's state, and the link to the privacy page, with Method where the header has no room for it. */
export function AppFooter(props: PrivacyNoteProps) {
  return (
    <footer className="app__footer muted">
      <PrivacyNote {...props} />
      <p className="app__footer-links">
        {/* The header names Method from 361 px; below that its second row has no room, so the footer does. */}
        <a className="app__footer-method" href={hrefFor({ page: 'method' })}>
          Method
        </a>
        <a href="/privacy">Privacy</a>
      </p>
    </footer>
  )
}
