import { Children } from 'react'
import type { ReactNode } from 'react'
import '../components/RowList.css'
import { PropertyList } from '../components/PropertyList'
import { NO_ROWS } from '../components/property'
import type { Property } from '../components/property'

/** What the disclosure under a page's answer or title says. */
export const PAGE_DETAILS_TERM = 'Details'

/**
 * The one ▸ Details under a page's answer or title (docs/design/system.md, No subtitle lines): the period's dates and
 * counts, what is not counted, a target or a caveat, each a line of its own, closed to start with. Nothing is drawn
 * when there is nothing to put in it.
 */
export function PageDetails({
  about,
  rows = NO_ROWS,
  method,
  methodName,
  children,
}: {
  /** What these Details are of, said to a screen reader after the word, where a page has more than one. */
  about?: string
  /** The facts, one a row (docs/design/system.md, Detail panels). */
  rows?: readonly Property[]
  /** The Method section that explains them, linked once under the rows. */
  method?: string
  /** What the Method link explains, said to a screen reader after the link. */
  methodName?: string
  children?: ReactNode
}) {
  const lines = Children.toArray(children)
  if (lines.length === 0 && rows.length === 0) return null
  return (
    <details className="disclosure page-details">
      <summary>
        {PAGE_DETAILS_TERM}
        {about === undefined ? null : <span className="sr-only">{` for ${about}`}</span>}
      </summary>
      <div className="disclosure__body disclosure__lines">
        <PropertyList rows={rows} method={method} methodName={methodName} />
        {lines}
      </div>
    </details>
  )
}
