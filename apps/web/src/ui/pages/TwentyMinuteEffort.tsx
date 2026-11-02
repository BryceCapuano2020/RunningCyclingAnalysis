import { ALL_OUT_FRACTION } from '@rca/core/effort'
import { formatPercent } from '@rca/core/units'
import { Definition } from '../components/Definition'
import { HEADLINE_LABEL } from '../grades'

/** What the max heart rate is, in a note beside the term. */
const MAX_HEART_RATE_MEANING = `The highest heart rate you hold for a sustained effort in each sport. An effort counts as hard when it reaches ${formatPercent(ALL_OUT_FRACTION)} of it.`

/** The id of the 20 minute effort's heading on How sure is this?, which the evidence card's link names. */
export const TWENTY_MINUTE_ID = 'method-twenty'

/**
 * The 20 minute effort, under the heart-rate check: the effort Balance uses, and what makes it count as
 * hard. The evidence card links here, and the page focuses this heading when it opens.
 */
export function TwentyMinuteEffort() {
  return (
    <>
      <h3 id={TWENTY_MINUTE_ID} tabIndex={-1}>
        The 20 min effort
      </h3>
      <p className="secondary">{`Balance uses your best ${HEADLINE_LABEL} in each sport.`}</p>
      <p className="secondary">
        The heart-rate check judges that effort against your{' '}
        <Definition meaning={MAX_HEART_RATE_MEANING}>max heart rate</Definition>.
      </p>
      <p className="secondary">It says whether the effort was hard.</p>
      <p className="secondary">
        {`A steady ${HEADLINE_LABEL} run, or a ${HEADLINE_LABEL} ride ridden hard, with heart rate on, narrows the check.`}
      </p>
    </>
  )
}
