import type { Sport } from '@rca/core/types'
import { anchorOf } from './sectionAnchor'
import type { SectionId, SectionOutcome } from './sportSections'

/** One cell of a row: a section's content as a band. */
export function SectionCell({
  sport,
  id,
  outcome,
}: {
  sport: Sport
  id: SectionId
  outcome: SectionOutcome
}) {
  const anchor = anchorOf(sport, id)
  return (
    <div id={anchor} className="band sport-panel" data-section={id}>
      {outcome.content}
    </div>
  )
}
