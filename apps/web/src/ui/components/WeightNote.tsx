import { WEIGHT_FIGURES_PURPOSE, WEIGHT_PROMPT_PARTS } from '../weightCopy'
import { hrefFor } from '../route'
import './WeightNote.css'

/**
 * Where ride figures wait for a weight. Nothing assumes one, so a ride's figures are held until the
 * athlete adds it, and this line says so and links to Profile. Its words are the prompt's lead and
 * page from weightCopy, with its own purpose: a card's note is about figures, not the comparison.
 */
export function WeightNote() {
  return (
    <p className="muted">
      {WEIGHT_PROMPT_PARTS.lead}{' '}
      <a className="weight-note__link" href={hrefFor({ page: 'profile' })}>
        {WEIGHT_PROMPT_PARTS.page}
      </a>{' '}
      {WEIGHT_FIGURES_PURPOSE}
    </p>
  )
}
