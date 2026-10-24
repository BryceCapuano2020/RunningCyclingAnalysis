import { PLACEHOLDER_BODY_KG } from '../athlete'
import { hrefFor } from '../route'

/**
 * Shown where ride figures are worked out from the placeholder body mass, because the athlete has
 * not entered a weight. It names the placeholder and links to where the weight is entered.
 */
export function WeightNote() {
  return (
    <p className="muted">
      Ride figures use {PLACEHOLDER_BODY_KG} kg until you add your weight on{' '}
      <a href={hrefFor({ page: 'profile' })}>Profile</a>.
    </p>
  )
}
