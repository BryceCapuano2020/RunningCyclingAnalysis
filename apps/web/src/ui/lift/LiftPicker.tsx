import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { liftName, liftOptions } from './liftNames'
import type { LiftOption, RecentLift } from './liftNames'
import './LiftPicker.css'

export interface LiftPickerProps {
  /** The last lifts used, newest first. They are listed before the catalog. */
  recent: readonly RecentLift[]
  /** The chosen exercise slug, shown in the field. */
  selected?: string | null
  /** A row was chosen: the exercise, and the equipment when it came from a recent lift. */
  onChoose: (choice: { exercise: string; equipment?: LiftOption['equipment'] }) => void
}

/** A search field over the catalog's lift names, as a combobox: arrows move, Enter chooses, Escape closes. */
export function LiftPicker({ recent, selected = null, onChoose }: LiftPickerProps) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const [text, setText] = useState(selected ? liftName(selected) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const options = liftOptions(text, recent)
  const shown = open && options.length > 0
  const activeIndex = Math.min(active, options.length - 1)

  const choose = (option: LiftOption) => {
    setText(liftName(option.exercise))
    setOpen(false)
    setActive(0)
    onChoose(
      option.equipment
        ? { exercise: option.exercise, equipment: option.equipment }
        : { exercise: option.exercise },
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + options.length) % options.length)
    } else if (event.key === 'Enter' && shown) {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) choose(option)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="lift-picker">
      <label className="lift-picker__label" htmlFor={`${baseId}-input`}>
        Lift
      </label>
      <input
        id={`${baseId}-input`}
        className="lift-picker__input"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${baseId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Lifts"
        className="lift-picker__list"
        hidden={!shown}
      >
        {options.map((option, index) => (
          <div
            key={`${option.exercise}.${option.equipment ?? ''}`}
            id={`${baseId}-option-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            className="lift-picker__option"
            // The mouse press chooses before the input's blur closes the list.
            onMouseDown={(event) => {
              event.preventDefault()
              choose(option)
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  )
}
