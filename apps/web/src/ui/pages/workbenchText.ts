import type { ActivityTrace, ReadingBand, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { TRIMMED_METRICS, displayValue, SPORT_READING } from './workbenchFormat'

/** What a missing reading is called. Where speed has a floor, a missing one is mostly standing still. */
export function noReadingLabel(metric: TraceMetric, sport: ActivityTrace['sport']): string {
  return metric === 'speed' && SPORT_READING[sport].minSpeedMs > 0
    ? 'Stopped or no reading'
    : 'No reading'
}

/** Moving time outside a trimmed axis: how long it lasted, and where it lay, such as "slower than 8:40 /km". */
export interface Beyond {
  seconds: number
  words: string
}

/** The moving time a trimmed axis leaves out below its low end and above its high end. */
export function beyondAxis(
  metric: TraceMetric,
  trace: ActivityTrace,
  units: UnitSystem,
  axis: ReadingBand,
): { below: Beyond | null; above: Beyond | null } {
  const named = TRIMMED_METRICS[metric]
  if (named === undefined) return { below: null, above: null }
  const text = (value: number) => displayValue(metric, value, trace.sport, units, trace.cadenceUnit)
  return {
    below:
      axis.below > 0 ? { seconds: axis.below, words: `${named.below} ${text(axis.low)}` } : null,
    above:
      axis.above > 0 ? { seconds: axis.above, words: `${named.above} ${text(axis.high)}` } : null,
  }
}

/** The line under a plot that says what its axis left out, or null when it left out nothing. */
export function beyondNote({ below, above }: ReturnType<typeof beyondAxis>): string | null {
  const parts = [below, above].flatMap((item) => (item === null ? [] : [item]))
  if (parts.length === 0) return null
  return `Past the axis, marked at its edge: ${parts.map((item) => `${item.seconds} s ${item.words}`).join(', ')}.`
}
