import { useId } from 'react'
import type { UnitSystem } from '../../core/units'
import './Header.css'

export interface HeaderProps {
  units: UnitSystem
  onUnitsChange: (units: UnitSystem) => void
}

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'Imperial' },
  { value: 'metric', label: 'Metric' },
]

export function Header({ units, onUnitsChange }: HeaderProps) {
  const groupName = useId()
  return (
    <header className="header">
      <div>
        <p className="header__brand">RunningCyclingAnalysis</p>
        <p className="header__tagline">Compare your running and cycling fitness in one unit</p>
      </div>
      <fieldset className="header__units">
        <legend className="sr-only">Units</legend>
        {UNIT_OPTIONS.map((option) => {
          const selected = option.value === units
          return (
            <label
              key={option.value}
              className={selected ? 'header__option header__option--selected' : 'header__option'}
            >
              <input
                className="header__radio"
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected}
                onChange={() => onUnitsChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </fieldset>
    </header>
  )
}
