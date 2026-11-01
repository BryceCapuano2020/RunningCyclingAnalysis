import { useId } from 'react'
import './SegmentedControl.css'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  /** A shorter label a stylesheet may show in its place; `label` stays the accessible name. */
  short?: string
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
  /**
   * Called when the segment that is already checked is clicked again, which a radio reports as no change. For a control whose
   * checked segment can be one the person did not pick, such as the window a default settled on, so that click can pick it.
   */
  onReselect?: (value: T) => void
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
  onReselect,
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
                onClick={() => {
                  if (isSelected) onReselect?.(option.value)
                }}
              />
              {option.short === undefined ? (
                <span>{option.label}</span>
              ) : (
                <span>
                  <span className="segmented-control__full">{option.label}</span>
                  <span className="segmented-control__short" aria-hidden="true">
                    {option.short}
                  </span>
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
