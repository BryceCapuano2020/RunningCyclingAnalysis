import { focusPageHeading } from '../pages/pageHeading'
import './SkipLink.css'

/**
 * The first control on the page, which takes a keyboard user straight to the page heading past the
 * header. It is a button, not a fragment link: a fragment would be read as a route.
 */
export function SkipLink() {
  return (
    <button type="button" className="skip-link" onClick={() => focusPageHeading()}>
      Skip to content
    </button>
  )
}
