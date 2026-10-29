import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import { SPORT_READING } from './workbenchFormat'

/** What a missing reading is called. Where speed has a floor, a missing one is mostly standing still. */
export function noReadingLabel(metric: TraceMetric, sport: ActivityTrace['sport']): string {
  return metric === 'speed' && SPORT_READING[sport].minSpeedMs > 0
    ? 'Stopped or no reading'
    : 'No reading'
}
