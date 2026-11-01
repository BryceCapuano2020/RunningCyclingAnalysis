import { ArrowRightIcon } from '../components/icons'
import { hrefFor } from '../route'

export interface EvidenceLineProps {
  /** True when the files have no heart rate, which the line then says before it links on. */
  noHeartRate: boolean
}

/** What to do when a file has no heart rate: the check cannot read effort without it. */
const ADD_HEART_RATE = 'Add heart rate to sharpen this'

/**
 * One line, never a card, under the tiles: the link to how sure the answer is, and for files with no heart rate a chip
 * that says there is no check, with the reason to add one in plain words (a screen keeps its defined terms few; Method says why heart rate matters). With heart rate on file the check is on the
 * tiles it qualifies (EffortChip), so the line is the link alone.
 */
export function EvidenceLine({ noHeartRate }: EvidenceLineProps) {
  return (
    <p className="evidence-line">
      {noHeartRate ? (
        <>
          <span className="chip">No heart-rate check</span>
          <span>{ADD_HEART_RATE}</span>
        </>
      ) : null}
      <a className="link-arrow" href={hrefFor({ page: 'method' })}>
        How sure is this?
        <ArrowRightIcon />
      </a>
    </p>
  )
}
