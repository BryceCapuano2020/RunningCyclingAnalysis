import { Definition } from '../components/Definition'
import { ArrowRightIcon } from '../components/icons'
import { hrefFor } from '../route'

export interface EvidenceLineProps {
  /** True when the files have no heart rate, which the line then says before it links on. */
  noHeartRate: boolean
}

/** What to do when a file has no heart rate: the check cannot read effort without it, and this says why. */
const ADD_HEART_RATE =
  'Heart rate shows how hard each best effort was. Wear a strap or a watch that records it, and export files that include it.'

/**
 * One line, never a card, under the tiles: the link to how sure the answer is, and for files with no heart rate a chip
 * that says there is no check, with the reason to add one as a definition. With heart rate on file the check is on the
 * tiles it qualifies (EffortChip), so the line is the link alone.
 */
export function EvidenceLine({ noHeartRate }: EvidenceLineProps) {
  return (
    <p className="evidence-line">
      {noHeartRate ? (
        <>
          <span className="chip">No heart-rate check</span>
          <Definition meaning={ADD_HEART_RATE}>Add heart rate to sharpen this</Definition>
        </>
      ) : null}
      <a className="link-arrow" href={hrefFor({ page: 'method' })}>
        How sure is this?
        <ArrowRightIcon />
      </a>
    </p>
  )
}
