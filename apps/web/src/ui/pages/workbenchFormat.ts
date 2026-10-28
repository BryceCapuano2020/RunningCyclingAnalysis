import type { ActivityTrace, CadenceUnit, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatElevation, formatPace, formatPower, formatSpeed } from '@rca/core/units'

export function metricLabel(metric: TraceMetric, sport: ActivityTrace['sport']): string {
  switch (metric) {
    case 'speed':
      return sport === 'run' ? 'Pace' : 'Speed'
    case 'power':
      return 'Measured power'
    case 'heartRate':
      return 'Heart rate'
    case 'cadence':
      return 'Cadence'
    case 'altitude':
      return 'Elevation'
    case 'temperature':
      return 'Temperature'
  }
}

export function metricUnit(
  metric: TraceMetric,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
  cadenceUnit?: CadenceUnit,
): string {
  switch (metric) {
    case 'speed':
      return sport === 'run'
        ? units === 'imperial'
          ? 'min/mi'
          : 'min/km'
        : units === 'imperial'
          ? 'mph'
          : 'km/h'
    case 'power':
      return 'W'
    case 'heartRate':
      return 'bpm'
    case 'cadence':
      return cadenceUnit === 'unknown'
        ? 'counts/min'
        : (cadenceUnit ?? (sport === 'run' ? 'steps/min' : 'rev/min'))
    case 'altitude':
      return units === 'imperial' ? 'ft' : 'm'
    case 'temperature':
      return units === 'imperial' ? '°F' : '°C'
  }
}

export function displayValue(
  metric: TraceMetric,
  value: number,
  sport: ActivityTrace['sport'],
  units: UnitSystem,
  cadenceUnit?: CadenceUnit,
): string {
  switch (metric) {
    case 'speed':
      return sport === 'run' ? formatPace(value, units) : formatSpeed(value, units)
    case 'power':
      return formatPower(value)
    case 'heartRate':
      return `${Math.round(value)} bpm`
    case 'cadence':
      return `${Math.round(value)} ${metricUnit(metric, sport, units, cadenceUnit)}`
    case 'altitude':
      return formatElevation(value, units)
    case 'temperature': {
      const converted = units === 'imperial' ? value * (9 / 5) + 32 : value
      const unit = units === 'imperial' ? 'F' : 'C'
      return `${Math.round(converted * 10) / 10}°${unit}`
    }
  }
}
