import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import type { DistributionBin } from './workbenchData'
import { displayValue, readingRange } from './workbenchFormat'

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

/** What a missing reading is called: a run's missing pace is mostly standing still. */
export function noReadingLabel(metric: TraceMetric): string {
  return metric === 'speed' ? 'Stopped or no reading' : 'No reading'
}
