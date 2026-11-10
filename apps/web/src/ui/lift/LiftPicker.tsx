import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { liftName, liftOptions, nameProblem } from './liftNames'
import type { LiftOption, RecentLift } from './liftNames'
import './LiftPicker.css'

export interface LiftPickerProps {
  /** The last lifts used, newest first. They are listed before the catalog. */
  recent: readonly RecentLift[]
  /** The chosen exercise slug, shown in the field. */
  selected?: string | null
  /** A row was chosen (the exercise, and the equipment when it came from a recent lift), or null when typing cleared the choice. */
  onChoose: (choice: { exercise: string; equipment?: LiftOption['equipment'] } | null) => void
}

/** A search field over the catalog's lift names, as a combobox: arrows move, Enter chooses, Escape closes. */
export function LiftPicker({ recent, selected = null, onChoose }: LiftPickerProps) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const [text, setText] = useState(selected ? liftName(selected) : '')
  const [chosen, setChosen] = useState(selected !== null)
  // The last choice, kept in state because a parent may null `selected` as soon as the text is edited.
  const [lastChoice, setLastChoice] = useState<{
    exercise: string
    equipment?: LiftOption['equipment']
  } | null>(selected ? { exercise: selected } : null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const options = liftOptions(text, recent)
  const shown = open && options.length > 0
  const activeIndex = Math.min(active, options.length - 1)

  // A new `selected` from the parent replaces what is shown (adjusted during render, not in an effect).
  const [seenSelected, setSeenSelected] = useState(selected)
  if (seenSelected !== selected) {
    setSeenSelected(selected)
    if (selected !== null) {
      setLastChoice({ exercise: selected })
      setChosen(true)
      setText(liftName(selected))
    }
  }

  useEffect(() => {
    if (shown)
      document
        .getElementById(`${baseId}-option-${activeIndex}`)
        ?.scrollIntoView?.({ block: 'nearest' })
  }, [shown, activeIndex, baseId])

  const choose = (option: LiftOption) => {
    setChosen(true)
    setText(liftName(option.exercise))
    setOpen(false)
    setActive(0)
    const choice = option.equipment
      ? { exercise: option.exercise, equipment: option.equipment }
      : { exercise: option.exercise }
    setLastChoice(choice)
    onChoose(choice)
  }

  // Leaving the field keeps a lift typed in full, else goes back to the chosen lift.
  const leave = () => {
    setOpen(false)
    if (chosen) return
    const typed = text.trim().toLowerCase()
    const exact = options.find((o) => !o.isNew && liftName(o.exercise).toLowerCase() === typed)
    if (exact) return choose(exact)
    const last = lastChoice
    setText(last ? liftName(last.exercise) : '')
    setChosen(last !== null)
    if (last) onChoose(last)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + options.length) % options.length)
    } else if ((event.key === 'Home' || event.key === 'End') && shown) {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : options.length - 1)
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
          if (chosen) {
            setChosen(false)
            onChoose(null)
          }
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={leave}
        onKeyDown={onKeyDown}
      />
      {options.length === 0 && nameProblem(text) && (
        <p role="alert" className="lift-picker__problem">
          {nameProblem(text)}
        </p>
      )}
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
