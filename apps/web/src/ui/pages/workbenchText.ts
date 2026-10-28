import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import type { DistributionBin } from './workbenchData'
import { displayValue, readingRange, SPORT_READING } from './workbenchFormat'

/** A bin as the range it covers, from its lowest reading to its highest. */
export function binRange(
  bin: DistributionBin,
  metric: TraceMetric,
  trace: ActivityTrace,
  units: UnitSystem,
): string {
  const { lowest, highest } = readingRange(metric, trace.sport, bin.from, bin.to)
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  return `${text(lowest)}–${text(highest)}`
}

/** What a missing reading is called. Where speed has a floor, a missing one is mostly standing still. */
export function noReadingLabel(metric: TraceMetric, sport: ActivityTrace['sport']): string {
  return metric === 'speed' && SPORT_READING[sport].minSpeedMs > 0
    ? 'Stopped or no reading'
    : 'No reading'
}
