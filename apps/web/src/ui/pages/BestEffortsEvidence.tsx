import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { GapTerm } from '../components/GapTerm'
import { SportRecords } from '../components/SportRecords'
import type { SparkPoint } from '../components/Sparkline'
import type { BestEffortRows } from './bestEffortRows'
import { PageDetails } from './PageDetails'

/** What a sport's figures are, said once for the list rather than on each row: a run's paces are grade-adjusted. */
const FIGURES_NOTE: Record<Sport, ReactNode> = {
  run: (
    <>
      Paces are grade-adjusted (<GapTerm />
      ).
    </>
  ),
  ride: null,
}

/**
 * Every best effort, in the sport's own units with its level and the activity that set it. What the figures are and what
 * a row lacks (a distance with no age standard, runs added before distance bests were recorded) are one ▸ Details after
 * the list: the section's heading is its own fold, and a second fold straight under it would read as an empty one.
 */
export function BestEffortsEvidence({
  sport,
  list,
  sparks,
}: {
  sport: Sport
  list: BestEffortRows
  /** Each row's trend by its key, where the page charts one. */
  sparks?: Readonly<Record<string, readonly SparkPoint[]>>
}) {
  return (
    <>
      <SportRecords rows={list.rows} sparks={sparks} />
      <PageDetails about="all best efforts">
        {FIGURES_NOTE[sport] === null ? null : <p>{FIGURES_NOTE[sport]}</p>}
        {list.listNotes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        {list.partial && (
          <p>
            Runs added before distance bests were recorded don’t have them yet, so these may not be
            the fastest. Add those runs again to include them.
          </p>
        )}
      </PageDetails>
    </>
  )
}
