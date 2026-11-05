import { SportRecords } from '../components/SportRecords'
import type { SparkPoint } from '../components/Sparkline'
import type { BestEffortRows } from './bestEffortRows'

/**
 * Every best effort, in the sport's own units with its level and the activity that set it, and the notes that
 * say what a row lacks: runs added before distance bests were recorded may hide faster ones.
 */
export function BestEffortsEvidence({
  list,
  sparks,
}: {
  list: BestEffortRows
  /** Each row's trend by its key, where the page charts one. */
  sparks?: Readonly<Record<string, readonly SparkPoint[]>>
}) {
  return (
    <>
      <SportRecords rows={list.rows} sparks={sparks} />
      {list.listNotes.map((note) => (
        <p key={note} className="muted">
          {note}
        </p>
      ))}
      {list.partial && (
        <p className="muted">
          Runs added before distance bests were recorded don’t have them yet, so these may not be
          the fastest. Add those runs again to include them.
        </p>
      )}
    </>
  )
}
