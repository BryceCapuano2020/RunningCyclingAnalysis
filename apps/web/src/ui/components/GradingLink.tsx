import type { MouseEvent, ReactNode } from 'react'
import { hrefFor } from '../route'
import { ArrowRightIcon } from './icons'
import { requestMethodSection } from './methodSection'
import { SECTION_ID } from './methodTopics'

/** A plain click in this window. Modified or other clicks open elsewhere, so nothing here follows them. */
function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}

/**
 * A link to the age grades on How sure is this?. The page focuses that heading once it opens, because
 * a fragment would change the hash route.
 */
export function GradesLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a
      className={className}
      href={hrefFor({ page: 'method' })}
      onClick={(event) => {
        if (isPlainPrimaryClick(event)) requestMethodSection(SECTION_ID.grades)
      }}
    >
      {children}
    </a>
  )
}

/** How a level is graded: a link to the age grades, under the grade. */
export function GradingLink() {
  return (
    <GradesLink className="link-arrow">
      How is this graded?
      <ArrowRightIcon />
    </GradesLink>
  )
}
