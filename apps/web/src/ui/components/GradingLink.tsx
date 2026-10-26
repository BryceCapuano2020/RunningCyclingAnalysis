import type { MouseEvent } from 'react'
import { hrefFor } from '../route'
import { ArrowRightIcon } from './icons'
import { requestMethodSection } from './methodSection'
import { SECTION_ID } from './methodTopics'

/**
 * How a level is graded: a link to the age grades on How sure is this?. The page focuses that
 * heading once it opens, because a fragment would change the hash route.
 */
/** A plain click in this window. Modified or other clicks open elsewhere, so nothing here follows them. */
function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}

export function GradingLink() {
  return (
    <a
      className="link-arrow"
      href={hrefFor({ page: 'method' })}
      onClick={(event) => {
        if (isPlainPrimaryClick(event)) requestMethodSection(SECTION_ID.grades)
      }}
    >
      How is this graded?
      <ArrowRightIcon />
    </a>
  )
}
