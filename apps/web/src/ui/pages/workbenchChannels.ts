import type { ActivityLap, ActivityTrace, MaskedMetric, TraceMetric } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatRecordTime } from '@rca/core/units'
import type { BrushOverview } from '../charts/TimeBrush'
import { hasReadingNear, meanAround } from '../charts/timeSeriesModel'
import type { AxisScale } from '../charts/timeSeriesModel'
import type { ChannelColour, CursorHead, StackChannel, StackMark } from '../charts/timeSeriesTypes'
import { MIN_LAPS } from '../components/lapRows'
import {
  movingAverageSpeed,
  plottedStream,
  selectionOf,
  seriesFor,
  smoothedBand,
  suggestedIntervals,
  typicalBand,
} from './workbenchData'
import {
  SPORT_READING,
  isPaceReading,
  metricLabel,
  metricUnit,
  readingRange,
} from './workbenchFormat'
import { readingOf, valueTicks } from './workbenchScale'

/** How each measure is drawn: its colour, whether its area is filled, and its row's height against a pace's. */
const STYLE: Record<
  TraceMetric,
  { colour: ChannelColour; shape: 'line' | 'area'; weight: number }
> = {
  speed: { colour: 'pace', shape: 'line', weight: 1 },
  power: { colour: 'power', shape: 'line', weight: 1 },
  heartRate: { colour: 'heartrate', shape: 'line', weight: 1 },
  cadence: { colour: 'cadence', shape: 'line', weight: 0.8 },
  altitude: { colour: 'elevation', shape: 'area', weight: 0.6 },
  temperature: { colour: 'neutral', shape: 'line', weight: 0.6 },
}

/** Names for the readout and the rows, where "Measured power" would not fit a phone's cell. */
const SHORT_LABEL: Partial<Record<TraceMetric, string>> = { power: 'Power' }

/** The colour a measure is drawn in, for its chip as for its row. */
export function colourOf(metric: TraceMetric): ChannelColour {
  return STYLE[metric].colour
}

/** The headroom kept above and below a measure's smoothed trend, as a share of its span, so the line clears a row's edges. */
const HEADROOM = 0.05
/** An area has this much of its span beneath its lowest reading, so its lowest point still has height. */
const AREA_FLOOR = 0.3
/** The least a pace axis spans, as a share of the pace: a steady run is drawn as steady, not stretched. */
const FLAT_PACE_SPAN = 0.1

/** Which scale a measure's row is drawn on: a pace evenly in pace, anything else in its own unit. */
function scaleOf(metric: TraceMetric, sport: ActivityTrace['sport']): AxisScale {
  return isPaceReading(metric, sport) ? 'pace' : 'linear'
}

/**
 * The axis's lowest and highest reading with room round them. A reading that cannot be negative never goes
 * below zero, and a pace never below `least`, the least speed that still counts as a reading: an axis reaching
 * zero speed would be an infinite pace. A pace's headroom is a share of its height in pace, so the fast end
 * clears the line as much as the slow end does.
 */
function paddedAxis(
  low: number,
  high: number,
  shape: 'line' | 'area',
  scale: AxisScale,
  least = Number.NEGATIVE_INFINITY,
) {
  if (scale === 'pace') {
    // Seconds a metre, so the span is read where the axis is even.
    const slow = 1 / Math.max(low, least, 0.01)
    const fast = 1 / Math.max(high, low, least, 0.01)
    // A flat trend still gets a span of a tenth of its pace, so its row reads as steady, not as a hairline.
    const pad = Math.max(slow - fast, fast * FLAT_PACE_SPAN) * HEADROOM
    const middle = (slow + fast) / 2
    const [near, far] =
      slow - fast < fast * FLAT_PACE_SPAN
        ? [middle - (fast * FLAT_PACE_SPAN) / 2, middle + (fast * FLAT_PACE_SPAN) / 2]
        : [fast, slow]
    return {
      low: Math.max(least, 1 / (far + pad)),
      high: 1 / Math.max(near - pad, near / 2),
    }
  }
  const span = high - low
  const pad = span > 0 ? span * HEADROOM : Math.max(1, Math.abs(high) * HEADROOM)
  const room = shape === 'area' ? Math.max(span, pad) * AREA_FLOOR : pad
  const paddedLow = low >= 0 && low - room < 0 && shape === 'line' ? 0 : low - room
  return { low: Math.max(least, paddedLow), high: high + pad }
}

/**
 * The axis a measure is plotted on, with room round it, or null with no readings. Every measure is read on the
 * span of its own smoothed trend over what is in view (its 1st to 99th percentile), so a lap far from the
 * activity's average fills its row, and a spike or a bad reading clips at the edge instead of squeezing the rest.
 */
export function plotDomain(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): { low: number; high: number } | null {
  const band = smoothedBand(trace, metric, startS, endS)
  const floor = metric === 'speed' ? SPORT_READING[trace.sport].minSpeedMs : undefined
  return band === null
    ? null
    : paddedAxis(band.low, band.high, STYLE[metric].shape, scaleOf(metric, trace.sport), floor)
}

/** Seconds in runs of 1s in a mask, as [from, to) pairs. */
function runsOfMask(mask: Uint8Array, wanted: number): [number, number][] {
  const runs: [number, number][] = []
  let from = -1
  for (let i = 0; i <= mask.length; i += 1) {
    const here = i < mask.length && mask[i] === wanted
    if (here && from < 0) from = i
    if (!here && from >= 0) {
      runs.push([from, i])
      from = -1
    }
  }
  return runs
}

/** The seconds the analysis left out of a measure, as stretches. Only speed, heart rate and power have any. */
export function skippedStretches(trace: ActivityTrace, metric: TraceMetric): [number, number][] {
  const mask = trace.unusable?.[metric as MaskedMetric]
  return mask === undefined ? [] : runsOfMask(mask, 1)
}

/** The stretches of the activity the device paused or did not record, for the lane under the rows. A gap outranks a pause. */
export function timelineMarks(trace: ActivityTrace): StackMark[] {
  const gaps = runsOfMask(trace.unrecorded, 1).map(([startS, endS]): StackMark => ({
    kind: 'unrecorded',
    startS,
    endS,
  }))
  const pauses = runsOfMask(trace.paused, 1).flatMap(([from, to]) => {
    const kept: StackMark[] = []
    let startS = from
    for (let i = from; i <= to; i += 1) {
      const covered = i < to && trace.unrecorded[i] === 1
      if (i === to || covered) {
        if (i > startS) kept.push({ kind: 'paused', startS, endS: i })
        startS = i + 1
      }
    }
    return kept
  })
  return [...pauses, ...gaps].sort((a, b) => a.startS - b.startS)
}

/** The laps the device recorded, or the intervals found in the readings when it recorded none; empty when there is nothing to choose. */
export function lapChoicesOf(trace: ActivityTrace): { recorded: boolean; laps: ActivityLap[] } {
  const recorded = trace.laps.length > 0
  const laps: ActivityLap[] = recorded ? trace.laps : suggestedIntervals(trace)
  // One recorded lap is the whole activity, which the whole-activity selection already is. A lone suggestion is a finding.
  if (laps.length === 0 || (recorded && laps.length < MIN_LAPS)) return { recorded, laps: [] }
  return { recorded, laps }
}

/**
 * The laps the device recorded and the intervals found in the readings, both: the suggestions sit beside the device's laps and
 * do not replace them, since the readings find work the device's own laps cut across (or never marked). One recorded lap is the whole
 * activity, which the whole-activity selection already is, so it is no choice; a suggestion is held to `suggestedIntervals`' own rule.
 */
export function lapGroupsOf(trace: ActivityTrace): {
  recorded: ActivityLap[]
  suggested: ActivityLap[]
} {
  return {
    recorded: trace.laps.length >= MIN_LAPS ? trace.laps : [],
    suggested: suggestedIntervals(trace),
  }
}

/** The measures as channels of the stack, over the window, at this many columns. */
export function channelsFor(
  trace: ActivityTrace,
  metrics: readonly TraceMetric[],
  units: UnitSystem,
  startS: number,
  endS: number,
  columns: number,
  tickCount: number,
): StackChannel[] {
  const summary = selectionOf(trace, startS, endS)
  return metrics.flatMap((metric): StackChannel[] => {
    const domain = plotDomain(trace, metric, startS, endS)
    const series = seriesFor(trace, metric, startS, endS, columns)
    const stream = plottedStream(trace, metric)
    if (domain === null || series === null || stream === null) return []
    const style = STYLE[metric]
    const { low, high } = domain
    const read = (raw: number) => readingOf(metric, raw, trace.sport, units, trace.cadenceUnit)
    // A speed's average is the figure the header and the interval's tiles give (distance over moving time), so the
    // readout does not say a second number beside them; the table keeps the mean of the readings, and says so.
    const mean =
      (metric === 'speed' ? movingAverageSpeed(summary) : null) ?? summary.metrics[metric]?.mean
    return [
      {
        key: metric,
        label: metricLabel(metric, trace.sport),
        short: SHORT_LABEL[metric] ?? metricLabel(metric, trace.sport),
        unit: metricUnit(metric, trace.sport, units, trace.cadenceUnit),
        ...style,
        low,
        high,
        scale: scaleOf(metric, trace.sport),
        ticks: valueTicks(metric, trace.sport, units, low, high, tickCount),
        columns: series,
        write: read,
        at: (second) => {
          // A paused or unrecorded second reads nothing, though the average round it has a value.
          if (!hasReadingNear(stream, second)) return null
          const raw = meanAround(stream, second, series.windowS, startS, endS)
          return Number.isFinite(raw) ? { raw, ...read(raw) } : null
        },
        average: mean === null || mean === undefined ? null : read(mean),
        skipped: skippedStretches(trace, metric),
      },
    ]
  })
}

/** The words at the head of the readout for a whole second: the time into the activity, and the distance there. */
export function headAt(trace: ActivityTrace, units: UnitSystem, second: number): CursorHead {
  const metres = trace.distance[second]
  return {
    time: formatRecordTime(second),
    distance:
      metres !== undefined && Number.isFinite(metres) ? formatDistance(metres, units) : null,
  }
}

/** What a screen reader hears of the drawing: where each channel mostly was over the window (its typical range). */
export function stackDescription(
  trace: ActivityTrace,
  metrics: readonly TraceMetric[],
  units: UnitSystem,
  startS: number,
  endS: number,
): string {
  const parts = metrics.flatMap((metric) => {
    const typical = typicalBand(trace, metric, startS, endS)
    if (typical === null) return []
    const { lowest, highest } = readingRange(metric, trace.sport, typical.low, typical.high)
    const text = (value: number) => {
      const { value: number, unit } = readingOf(
        metric,
        value,
        trace.sport,
        units,
        trace.cadenceUnit,
      )
      return unit === '' ? number : `${number} ${unit}`
    }
    const label = metricLabel(metric, trace.sport)
    return [
      lowest === highest
        ? `${label} steady at ${text(lowest)}`
        : `${label} mostly between ${text(lowest)} and ${text(highest)}`,
    ]
  })
  return `From ${formatRecordTime(startS)} to ${formatRecordTime(endS)}: ${parts.join('; ')}`
}

/**
 * The measures the brush's overview prefers, in order, for each sport: the one the sport is read by first (pace
 * for a run, power for a ride), so the overview shows where the effort was, then what else the file holds.
 */
const OVERVIEW_ORDER: Record<ActivityTrace['sport'], readonly TraceMetric[]> = {
  run: ['speed', 'heartRate', 'cadence', 'altitude'],
  ride: ['power', 'speed', 'heartRate', 'cadence', 'altitude'],
}
const OVERVIEW_COLUMNS = 360

/** One measure over the whole activity, small, for the brush to sit over. Null when the trace holds none that varies. */
export function overviewOf(trace: ActivityTrace, max: number): BrushOverview | null {
  for (const metric of OVERVIEW_ORDER[trace.sport]) {
    const domain = plotDomain(trace, metric, 0, max)
    const columns = seriesFor(trace, metric, 0, max, OVERVIEW_COLUMNS)
    if (domain === null || columns === null) continue
    const means = columns.mean.filter(Number.isFinite)
    // A line that never moves is not an overview, whichever measure it is.
    if (means.length === 0 || Math.min(...means) === Math.max(...means)) continue
    return { columns, colour: STYLE[metric].colour, scale: scaleOf(metric, trace.sport), ...domain }
  }
  return null
}
