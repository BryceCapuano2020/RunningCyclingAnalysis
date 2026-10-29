import type { Sport } from '@rca/core/types'
import { SectionDisclosure } from './SectionDisclosure'
import { anchorOf } from './sectionAnchor'
import type { SectionId, SectionOutcome } from './sportSections'

/** One cell of a row: a section's content as a card, or as a disclosure when it has a closed row. */
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
  if (outcome.closed) {
    return (
      <SectionDisclosure id={anchor} {...outcome.closed}>
        {outcome.content}
      </SectionDisclosure>
    )
  }
  return (
    <div id={anchor} className="card sport-panel" data-section={id}>
      {outcome.content}
    </div>
  )
}
