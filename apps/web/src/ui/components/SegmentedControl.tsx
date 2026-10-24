import { useId } from 'react'
import './SegmentedControl.css'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  /** Names the group for assistive technology. */
  legend: string
  /** Hides the legend visually. It still names the group. */
  legendHidden?: boolean
  options: SegmentedControlOption<T>[]
  /** Null when nothing has been chosen yet, so no segment is checked. */
  selected: T | null
  onSelect: (value: T) => void
}

/**
 * A row of radio buttons drawn as segments. The checked segment is marked by weight and a filled
 * background as well as colour, and the focus ring is drawn on the visible label.
 */
export function SegmentedControl<T extends string>({
  legend,
  legendHidden = false,
  options,
  selected,
  onSelect,
}: SegmentedControlProps<T>) {
  const groupName = useId()
  return (
    <fieldset className="segmented-control">
      <legend className={legendHidden ? 'sr-only' : 'segmented-control__legend'}>{legend}</legend>
      <div className="segmented-control__options">
        {options.map((option) => {
          const isSelected = option.value === selected
          return (
            <label
              key={option.value}
              className={
                isSelected
                  ? 'segmented-control__option segmented-control__option--selected'
                  : 'segmented-control__option'
              }
            >
              <input
                className="segmented-control__radio"
                type="radio"
                name={groupName}
                value={option.value}
                checked={isSelected}
                onChange={() => onSelect(option.value)}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
