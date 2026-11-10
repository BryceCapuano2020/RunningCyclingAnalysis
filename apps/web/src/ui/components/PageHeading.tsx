import type { ReactNode } from 'react'
import { PAGE_HEADING_ID } from '../pages/pageHeading'
import './PageHeading.css'

/**
 * A page's one h1. The app moves focus to it when the page changes, so it carries the shared id and takes focus
 * without a tab stop. A page action, such as Share, sits at the right of the heading's line.
 */
export function PageHeading({
  children,
  className,
  action,
}: {
  children: ReactNode
  className?: string
  /** An icon button for the page as a whole, beside the heading. */
  action?: ReactNode
}) {
  const heading = (
    <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={className}>
      {children}
    </h1>
  )
  if (action === undefined || action === null) return heading
  return (
    <div className="page-heading">
      {heading}
      {action}
    </div>
  )
}
