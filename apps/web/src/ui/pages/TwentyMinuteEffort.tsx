import { HEADLINE_LABEL } from '../grades'

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
        The 20 minute effort
      </h3>
      <p className="secondary">
        {`Balance uses your best ${HEADLINE_LABEL} in each sport. The heart-rate check judges that effort against your reference heart rate, and says whether it was hard. A steady ${HEADLINE_LABEL} run or ridden hard, with heart rate on, is what narrows the check.`}
      </p>
    </>
  )
}
