import type { MouseEvent, ReactNode } from 'react'
import { hrefFor } from '../route'
import { requestMethodSection } from './methodSection'
import { SECTION_ID } from './methodTopics'

/** A plain click in this window. Modified or other clicks open elsewhere, so nothing here follows them. */
function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}

/**
 * A link to one section of Method. The page focuses that heading once it opens, because a
 * fragment would change the hash route.
 */
export function MethodSectionLink({
  sectionId,
  className,
  children,
}: {
  sectionId: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      className={className}
      href={hrefFor({ page: 'method' })}
      onClick={(event) => {
        if (isPlainPrimaryClick(event)) requestMethodSection(sectionId)
      }}
    >
      {children}
    </a>
  )
}

/** A link to the age grades on Method. */
export function GradesLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <MethodSectionLink sectionId={SECTION_ID.grades} className={className}>
      {children}
    </MethodSectionLink>
  )
}
