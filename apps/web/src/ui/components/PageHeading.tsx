import type { ReactNode } from 'react'
import { PAGE_HEADING_ID } from '../pages/pageHeading'

/**
 * A page's one h1. The app moves focus to it when the page changes, so it carries the shared id and takes focus
 * without a tab stop.
 */
export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={className}>
      {children}
    </h1>
  )
}
