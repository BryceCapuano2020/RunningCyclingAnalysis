import { ArrowRightIcon } from '../components/icons'
import { hrefFor } from '../route'

/**
 * One line, never a card, under the tiles: the link to how sure the answer is. How the answer was worked out, and what
 * a heart rate would add, is on that page, one tap down; the Balance page carries no chip or nudge about it.
 */
export function EvidenceLine() {
  return (
    <p className="evidence-line">
      <a className="link-arrow" href={hrefFor({ page: 'method' })}>
        How sure is this?
        <ArrowRightIcon />
      </a>
    </p>
  )
}
