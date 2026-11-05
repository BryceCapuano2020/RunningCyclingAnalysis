import { NumText } from '../components/NumText'
import { ALL_OUT_FRACTION } from '@rca/core/effort'
import { formatPercent } from '@rca/core/units'
import { Definition } from '../components/Definition'
import { HEADLINE_LABEL } from '../grades'

/** What the max heart rate is, in a note beside the term. */
const MAX_HEART_RATE_MEANING = `The highest heart rate you hold for a sustained effort in each sport. An effort counts as hard when it reaches ${formatPercent(ALL_OUT_FRACTION)} of it.`

/** The id of the 20 minute effort's heading on Method, which the evidence card's link names. */
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
      <p className="secondary">
        <span className="method__line">
          <NumText
            text={`Balance’s changes and energy view read your best ${HEADLINE_LABEL} in each sport.`}
          />
        </span>{' '}
        <span className="method__line">
          The heart-rate check judges that effort against your{' '}
          <Definition meaning={MAX_HEART_RATE_MEANING}>max heart rate</Definition>.
        </span>{' '}
        <span className="method__line">It says whether the effort was hard.</span>{' '}
        <span className="method__line">
          <NumText
            text={`A steady ${HEADLINE_LABEL} run, or a ${HEADLINE_LABEL} ride ridden hard, with heart rate on, narrows the check.`}
          />
        </span>
      </p>
    </>
  )
}
