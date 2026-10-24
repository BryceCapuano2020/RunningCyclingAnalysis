import { hrefFor } from '../route'

/**
 * Where ride figures wait for a weight. Nothing assumes one, so a ride's figures are held until the
 * athlete adds it, and this line says so and links to Profile.
 */
export function WeightNote() {
  return (
    <p className="muted">
      Add your weight on <a href={hrefFor({ page: 'profile' })}>Profile</a> to see ride figures.
    </p>
  )
}
