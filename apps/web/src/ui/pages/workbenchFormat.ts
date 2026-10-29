import type { ActivityTrace, CadenceUnit, TraceMetric } from '@rca/core/workbench'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatElevation, formatPace, formatPower, formatSpeed } from '@rca/core/units'

/** The measures in the order they are listed, plotted and tabulated. */
export const METRIC_ORDER: readonly TraceMetric[] = [
  'speed',
  'power',
  'heartRate',
  'cadence',
  'altitude',
  'temperature',
]

/** The measures plotted when the activity opens. The rest can be chosen. */
export const DEFAULT_METRICS: readonly TraceMetric[] = ['speed', 'power', 'heartRate', 'altitude']

/**
 * The measures whose plot axis and histogram leave out the few extreme readings at either end, and the
 * words for a reading beyond each end. A standing start or a stop leaves a handful of readings that would
 * otherwise stretch the axis over space nothing else uses.
 */
export const TRIMMED_METRICS: Partial<Record<TraceMetric, { below: string; above: string }>> = {
  speed: { below: 'slower than', above: 'faster than' },
}

/** What differs between the sports in an activity's readings, in one place and keyed by Sport. */
interface SportReading {
  /** The name of the speed measure. */
  speedLabel: string
  speedUnit: (units: UnitSystem) => string
  speedText: (speedMs: number, units: UnitSystem) => string
  /**
   * Whether speed is shown as a pace, so a faster reading is a lower number. Its range then runs
   * from the fastest reading to the slowest, and so do its histogram bins.
   */
  speedIsPace: boolean
  /** The slowest speed, in m/s, that still counts as a reading. Below it the athlete has stopped. */
  minSpeedMs: number
  /** The unit of cadence when the source does not say. */
  cadenceUnit: Exclude<CadenceUnit, 'unknown'>
}

export const SPORT_READING: Record<Sport, SportReading> = {
  run: {
    speedLabel: 'Pace',
    speedUnit: (units) => (units === 'imperial' ? 'min/mi' : 'min/km'),
    speedText: formatPace,
    speedIsPace: true,
    // About 33 min/km: slower than that is standing, not running, and has no meaningful pace.
    minSpeedMs: 0.5,
    cadenceUnit: 'steps/min',
  },
  ride: {
    speedLabel: 'Speed',
    speedUnit: (units) => (units === 'imperial' ? 'mph' : 'km/h'),
    speedText: formatSpeed,
    speedIsPace: false,
    minSpeedMs: 0,
    cadenceUnit: 'rev/min',
  },
}

export function metricLabel(metric: TraceMetric, sport: ActivityTrace['sport']): string {
  switch (metric) {
    case 'speed':
      return SPORT_READING[sport].speedLabel
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
      return SPORT_READING[sport].speedUnit(units)
    case 'power':
      return 'W'
    case 'heartRate':
      return 'bpm'
    case 'cadence':
      return cadenceUnit === 'unknown'
        ? 'counts/min'
        : (cadenceUnit ?? SPORT_READING[sport].cadenceUnit)
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
      return SPORT_READING[sport].speedText(value, units)
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

/** Whether a measure is read as a pace, so a faster reading is a lower number. */
export function isPaceReading(metric: TraceMetric, sport: ActivityTrace['sport']): boolean {
  return metric === 'speed' && SPORT_READING[sport].speedIsPace
}

/**
 * A measure's lowest and highest reading as the page reads them. A pace is lowest when it is fastest,
 * so its lowest reading comes from the highest speed.
 */
export function readingRange(
  metric: TraceMetric,
  sport: ActivityTrace['sport'],
  min: number,
  max: number,
): { lowest: number; highest: number } {
  return isPaceReading(metric, sport)
    ? { lowest: max, highest: min }
    : { lowest: min, highest: max }
}

/** The headings over a measure's lowest and highest readings. A pace says fastest and slowest. */
export function rangeHeadings(
  metric: TraceMetric,
  sport: ActivityTrace['sport'],
): [lowest: string, highest: string] {
  return isPaceReading(metric, sport) ? ['Fastest', 'Slowest'] : ['Lowest', 'Highest']
}
