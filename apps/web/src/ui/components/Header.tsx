import type { ReactNode } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { APP_NAME } from '../../appName'
import { SegmentedControl } from './SegmentedControl'
import './Header.css'

export interface HeaderProps {
  units: UnitSystem
  onUnitsChange: (units: UnitSystem) => void
  /** Rendered at the end of the header, e.g. the account menu. */
  actions?: ReactNode
}

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'Imperial' },
  { value: 'metric', label: 'Metric' },
]

export function Header({ units, onUnitsChange, actions }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <p className="header__brand">{APP_NAME}</p>
        <p className="header__tagline">
          Compare your running and cycling energy estimates in one unit
        </p>
      </div>
      <SegmentedControl
        legend="Units"
        legendHidden
        options={UNIT_OPTIONS}
        selected={units}
        onSelect={onUnitsChange}
      />
      {actions}
    </header>
  )
}
