import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { ThresholdEstimate } from '@rca/core/threshold'
import { plural } from './components/plural'
import { rowsAsText } from './components/property'
import type { Property } from './components/property'
import { formatDayMonth } from './format/date'
import { effortLabel } from './records'
import { thresholdSpan } from './thresholdRange'
import { thresholdEstimate } from './thresholdEstimate'

/** What a row calls the activities a threshold rests on. */
const USED_LABEL: Record<Sport, string> = { run: 'Runs used', ride: 'Rides used' }

/**
 * Whether heart rate raised the answer. The answer is the power estimate itself unless heart rate raised it, so it is above
 * the power estimate exactly when heart rate lifted it. False where heart rate was refused.
 */
export function heartRateLifted(estimate: ThresholdEstimate): boolean {
  return !('refused' in estimate.heartRate) && estimate.value > estimate.efforts.value
}

/** What heart rate did to a ride estimate, as a row's value. Why it was not used is on Method. */
function heartRateValue(estimate: ThresholdEstimate): string {
  const { heartRate } = estimate
  if ('refused' in heartRate) return 'Not used'
  const from = plural(heartRate.efforts, 'effort')
  return heartRateLifted(estimate) ? `Raised it, from ${from}` : `Read, no change, from ${from}`
}

/** The rows only a sport has: a ride's watts may be estimated and heart rate may raise it, a run is worked out from pace alone. */
const OWN_ROWS: Record<Sport, (estimate: ThresholdEstimate) => Property[]> = {
  run: () => [],
  ride: (estimate) => [
    ...(estimate.efforts.strongest.estimated
      ? [{ label: 'Power', value: 'Estimated, no power meter' }]
      : []),
    { label: 'Heart rate', value: heartRateValue(estimate) },
  ],
}

/** What a threshold rests on, as rows: how many runs or rides, and the strongest effort with its day. Empty without an estimate. */
function basisRows(result: AnalysisResult, sport: Sport): Property[] {
  const estimate = thresholdEstimate(result, sport)
  if (!estimate) return []
  const { rides, strongest } = estimate.efforts
  const activity = result.activities.find((candidate) => candidate.id === strongest.activityId)
  const day = activity === undefined ? '' : `, ${formatDayMonth(activity.startMs)}`
  return [
    { label: USED_LABEL[sport], value: String(rides) },
    { label: 'Strongest effort', value: `${effortLabel(strongest.durationS)}${day}` },
  ]
}

/** What a threshold rests on as one text, or null without an estimate. The owner's eval reads the words a surface prints from this. */
export function thresholdBasisLine(result: AnalysisResult, sport: Sport): string | null {
  const rows = basisRows(result, sport)
  return rows.length === 0 ? null : rowsAsText(rows)
}

/**
 * How a threshold was worked out, as a detail panel's rows (docs/design/system.md, Detail panels): how many runs or
 * rides it rests on, the strongest effort with its day, the range, whether a ride's watts are estimated, and for a ride
 * what heart rate did. The method itself is on Method. Empty without an estimate.
 */
export function thresholdProperties(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): Property[] {
  const estimate = thresholdEstimate(result, sport)
  if (!estimate) return []
  const span = thresholdSpan(result, sport, massKg, units)
  return [
    ...basisRows(result, sport),
    ...(span === null ? [] : [{ label: 'Range', value: span }]),
    ...OWN_ROWS[sport](estimate),
  ]
}
