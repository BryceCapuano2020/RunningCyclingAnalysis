import type { Sport } from '@rca/core/types'
import { anchorOf } from './sectionAnchor'
import type { SectionId } from './sportSections'

/**
 * A section the library cannot fill yet: its name and one line that says what to add, in its own place on the page.
 * No section leaves the page in silence, and none lists more than the one thing to add.
 */
export function SectionLine({
  sport,
  id,
  title,
  line,
}: {
  sport: Sport
  id: SectionId
  title: string
  line: string
}) {
  const anchor = anchorOf(sport, id)
  return (
    <section className="section" data-sport={sport} aria-labelledby={`${anchor}-title`}>
      <h2 id={`${anchor}-title`}>{title}</h2>
      <p className="muted">{line.endsWith('.') ? line : `${line}.`}</p>
    </section>
  )
}
