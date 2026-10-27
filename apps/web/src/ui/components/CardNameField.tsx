import { CARD_NAME_MAX, capCardName } from '../../share/cardName'
import './CardNameField.css'

export interface CardNameFieldProps {
  value: string
  /** Called with the name as typed, held to the most a card shows. */
  onChange: (name: string) => void
}

/** The name printed on a shared card. Empty by default, and kept on this device only. */
export function CardNameField({ value, onChange }: CardNameFieldProps) {
  return (
    <label className="card-name-field">
      <span className="card-name-field__label">Name on the card</span>
      <input
        className="card-name-field__input"
        type="text"
        value={value}
        maxLength={CARD_NAME_MAX}
        onChange={(event) => onChange(capCardName(event.target.value))}
      />
    </label>
  )
}
