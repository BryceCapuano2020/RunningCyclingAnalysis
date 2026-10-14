import type { UnitSystem } from '../../core/units'
import { SegmentedControl } from './SegmentedControl'
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
  return (
    <header className="header">
      <div>
        <p className="header__brand">RunningCyclingAnalysis</p>
        <p className="header__tagline">Compare your running and cycling fitness in one unit</p>
      </div>
      <SegmentedControl
        legend="Units"
        legendHidden
        options={UNIT_OPTIONS}
        selected={units}
        onSelect={onUnitsChange}
      />
    </header>
  )
}
