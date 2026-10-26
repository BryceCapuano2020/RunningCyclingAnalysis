import { WEIGHT_PROMPT_PARTS } from '../weightCopy'
import { hrefFor } from '../route'

/**
 * The one prompt for a missing body weight, shown where a ride is held for want of it, with Profile
 * as the link. The words are in weightCopy, so a plain-text note says the same thing.
 */
export function WeightPrompt() {
  return (
    <>
      {WEIGHT_PROMPT_PARTS.lead}{' '}
      <a href={hrefFor({ page: 'profile' })}>{WEIGHT_PROMPT_PARTS.page}</a>{' '}
      {WEIGHT_PROMPT_PARTS.purpose}
    </>
  )
}
