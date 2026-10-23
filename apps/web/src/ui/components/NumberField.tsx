import { useId } from 'react'
import type { ComponentPropsWithRef } from 'react'
import './NumberField.css'

export type NumberFieldProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'id'> & {
  id: string
  label: string
  /** Drawn inside the right edge of the input, such as kg. */
  unit?: string
  /** Why the entry cannot be used. The message is announced as it appears. */
  error?: string | null
}

/** A labelled text input for numbers, with its unit and its error. Callers own the value. */
export function NumberField({ id, label, unit, error = null, ...input }: NumberFieldProps) {
  const baseId = useId()
  const unitId = `${baseId}-unit`
  const errorId = `${baseId}-error`
  const describedBy = [input['aria-describedby'], unit ? unitId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="number-field">
      <label className="number-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="number-field__input">
        <input
          {...input}
          id={id}
          type="text"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {unit && (
          <span id={unitId} className="number-field__unit">
            {unit}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="number-field__error">
          {error}
        </p>
      )}
    </div>
  )
}
