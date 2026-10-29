import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Curve, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatWkg } from '@rca/core/units'
import { CURVE_START_S, RECORD_DURATIONS_S, effortLabel } from '../records'
import { SPORT_FORMAT, SPORT_LABEL } from '../sports'
import { sourceNote } from './activityText'
import { carriedNote, carriedSpans, isCarried } from './carriedStretches'
import type { CarriedSpan } from './carriedStretches'
import type { AxisTick, ChartSize, Point, TooltipContent, TooltipRow } from './chartTypes'
import { durationRows, MIN_DURATION_S } from './curveRows'
import { wkgOf } from './curveTable'
import type { CurveRow, View } from './curveTable'
import { logScale } from './scale'
import { formatNative, nativeLabel, plottedValue, sportYAxis, usable } from './sportAxis'
import { durationTicks, fitTicks } from './ticks'

/** The first duration, s, a sport's chart draws: its curve's start, and never under a minute. */
function chartStartS(sport: Sport): number {
  return Math.max(CURVE_START_S[sport], MIN_DURATION_S)
}

/**
 * One row per duration from the sport's curve start with a value in either period. A row is carried when
 * its value is a longer effort's, copied down the curve by the envelope: the file has no effort of its length.
 */
export function buildRows(sport: Sport, curve: Curve, before: Curve): CurveRow[] {
  return durationRows([curve, before])
    .filter(({ durationS }) => durationS >= chartStartS(sport))
    .map(({ durationS, points: [current, earlier] }) => ({
      durationS,
      value: usable(current?.value ?? NaN),
      previous: usable(earlier?.value ?? NaN),
      activityId: current?.activityId ?? null,
      carried: current !== undefined && isCarried(current),
      previousCarried: earlier !== undefined && isCarried(earlier),
      carriedFromS:
        current !== undefined && isCarried(current) ? (current.windowS ?? undefined) : undefined,
    }))
    .filter((row) => Number.isFinite(row.value) || Number.isFinite(row.previous))
}

/** A duration the records list names, which the curve marks at each of its points. */
export function isRecordDuration(sport: Sport, durationS: number): boolean {
  return RECORD_DURATIONS_S[sport].includes(durationS)
}

/** The curve's first duration in words: "a minute", or "3 min" from two minutes up. */
export function startText(sport: Sport): string {
  const startS = chartStartS(sport)
  return startS === MIN_DURATION_S ? 'a minute' : effortLabel(startS)
}

/** The best 20 minutes when there is one, else the longest effort. Its index in rows, or -1. */
export function emphasisIndex(rows: CurveRow[]): number {
  const headline = rows.findIndex(
    (row) => row.durationS === HEADLINE_DURATION_S && Number.isFinite(row.value),
  )
  return headline >= 0 ? headline : rows.findLastIndex((row) => Number.isFinite(row.value))
}

export interface Layout {
  xs: number[]
  points: (Point | null)[]
  /** The y of each duration's point, for anchoring its tooltip beside it. */
  ys: (number | null)[]
  earlier: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  /** The y of a value in the sport's own number, for the threshold line. */
  yOf: (native: number) => number
  /** Which rows are carried, in row order. */
  carried: boolean[]
  /** The stretches with no effort on file, as indexes into the rows. */
  spans: CarriedSpan[]
}

/** The value, in the sport's own number, of a threshold line the chart draws and gives room on its axis. */
export interface ThresholdLine {
  value: number
  /** The 90% range's edges, in the same number, for the band round the line. */
  low?: number
  high?: number
  /** The range as the page words it, such as "Range 7:07 to 7:18 /mi". */
  detail?: string
  /** The fit rests on estimated watts: the line is drawn and named as an estimate. */
  estimated?: boolean
}

export function layout(
  rows: CurveRow[],
  view: View,
  size: ChartSize,
  threshold: ThresholdLine | null,
): Layout | null {
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = logScale([first.durationS, last.durationS], [plot.left, plot.right])
  const plotted = (value: number) => plottedValue(view.sport, value, view.units)
  const natives = [
    ...rows.flatMap((row) => [row.value, row.previous]),
    ...(threshold ? [threshold.low ?? threshold.value, threshold.high ?? threshold.value] : []),
  ].filter(Number.isFinite)
  const { y, ticks } = sportYAxis(view.sport, natives.map(plotted), plot)
  const pointsOf = (pick: (row: CurveRow) => number): (Point | null)[] =>
    rows.map((row) =>
      Number.isFinite(pick(row)) ? { x: x(row.durationS), y: y(plotted(pick(row))) } : null,
    )
  const points = pointsOf((row) => row.value)
  const carried = rows.map((row) => row.carried === true)
  return {
    xs: rows.map((row) => x(row.durationS)),
    points,
    ys: points.map((point) => point?.y ?? null),
    earlier: pointsOf((row) => row.previous),
    xTicks: fitTicks(durationTicks(first.durationS, last.durationS, x), {
      axis: 'x',
      width,
      // The 20 minute tick is the one the emphasised point names, so thinning keeps it.
      keep: (tick) => tick.label === formatDuration(HEADLINE_DURATION_S),
    }),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    yOf: (native) => y(plotted(native)),
    carried,
    spans: carriedSpans(
      carried,
      points.map((point) => point !== null),
    ),
  }
}

/** Cycling tooltips and tables give the mechanical W/kg; running names only its activity. */
function noteOf(row: CurveRow, view: View): string | undefined {
  const source = sourceNote(row.activityId, view.names)
  // A carried value says whose it is first: it is a longer effort's, copied down.
  const carried =
    row.carried === true && row.carriedFromS !== undefined
      ? carriedNote(row.carriedFromS)
      : undefined
  const parts = [
    ...(SPORT_FORMAT[view.sport].showsWkg ? [formatWkg(wkgOf(row, view))] : []),
    ...(carried === undefined ? [] : [carried]),
    ...(source === undefined ? [] : [source]),
  ]
  return parts.length === 0 ? undefined : parts.join(', ')
}

export function tooltipFor(row: CurveRow, x: number, y: number, view: View): TooltipContent {
  const rows: TooltipRow[] = []
  if (Number.isFinite(row.value)) {
    rows.push({
      kind: view.sport,
      label: nativeLabel(view.sport),
      value: formatNative(view.sport, row.value, view.units),
      note: noteOf(row, view),
    })
  }
  if (view.previous && Number.isFinite(row.previous)) {
    rows.push({
      kind: 'neutral',
      label: view.previous.label,
      value: formatNative(view.sport, row.previous, view.units),
      swatch: 'previous',
    })
  }
  return { x, y, title: formatDuration(row.durationS), rows }
}

/** The name of the chart, with the unit spelt out: "per kilometre", "in watts". */
export function titleOf(sport: Sport, units: UnitSystem): string {
  return `${SPORT_LABEL[sport]} ${SPORT_FORMAT[sport].titleUnit(units)} by duration`
}
