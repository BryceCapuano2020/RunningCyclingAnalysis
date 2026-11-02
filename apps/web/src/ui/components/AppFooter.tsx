import { hrefFor } from '../route'
import { PrivacyNote } from './PrivacyNote'
import type { PrivacyNoteProps } from './PrivacyNote'

/** The foot of every page: the privacy sentence for the visitor's state, and the links to the method and the privacy page. */
export function AppFooter(props: PrivacyNoteProps) {
  return (
    <footer className="app__footer muted">
      <PrivacyNote {...props} />
      <p>
        <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
        {' · '}
        <a href="/privacy">Privacy</a>
      </p>
    </footer>
  )
}
