import type { UnitSystem } from '@rca/core/units'
import { formatDuration } from '@rca/core/units'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { spreadApart } from './chartInteraction'
import { logScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { axisFontSize, durationTicks, fitTicks, labelWidth, rootScale } from './ticks'
import { labelledYears } from './yearCurvesModel'
import type { YearCurvesModel } from './yearCurvesModel'

/** The gap, px, between a line's end and the year that names it. */
const LABEL_GAP_PX = 8

/** A year's line: its year, the points it has (null where it has none) and whether it is labelled. */
export interface LineLayout {
  year: number
  recency: number
  labelled: boolean
  points: (Point | null)[]
}

/** A labelled line's name, at the end of the line. */
export interface EndLabel {
  year: number
  x: number
  y: number
}

export interface YearCurvesLayout {
  xs: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  lines: LineLayout[]
  labels: EndLabel[]
  /** The 20 minute point of each labelled line, where the finding's mark sits; empty when the finding is about another length. */
  headline: { year: number; hard: boolean; point: Point }[]
}

/** The room a label of a year needs to the right of the plot, px, at the reader's text size. */
export function endLabelRoom(width: number): number {
  return Math.ceil(labelWidth('0000', axisFontSize(width), rootScale())) + LABEL_GAP_PX + 4
}

/**
 * The lines on the sport page's own scales: duration on a log axis, the pace or power axis the curve chart uses. The newest
 * year and the best year are named at their ends, the names kept clear of each other.
 */
export function yearCurvesLayout(
  model: YearCurvesModel,
  units: UnitSystem,
  size: ChartSize,
): YearCurvesLayout | null {
  const first = model.durations[0]
  const last = model.durations.at(-1)
  if (first === undefined || last === undefined || model.durations.length < 2) return null
  const { plot, width } = size
  const x = logScale([first, last], [plot.left, plot.right])
  const plotted = (value: number) => plottedValue(model.sport, value, units)
  const values = model.lines.flatMap((line) =>
    line.values.flatMap((value) => (value === null ? [] : [plotted(value)])),
  )
  const { y, ticks } = sportYAxis(model.sport, values, plot)
  const named = new Set(labelledYears(model))
  const lines = model.lines.map((line): LineLayout => ({
    year: line.year,
    recency: line.recency,
    labelled: named.has(line.year),
    points: line.values.map((value, i) =>
      value === null ? null : { x: x(model.durations[i]!), y: y(plotted(value)) },
    ),
  }))
  const ends = lines
    .filter((line) => line.labelled)
    .map((line) => ({ year: line.year, end: line.points.findLast((point) => point !== null)! }))
  const fontSize = axisFontSize(width)
  const spread = spreadApart(
    ends.map(({ end }) => end.y),
    fontSize + 2,
  )
  const headline =
    model.focus === null || model.durations[model.focus] !== HEADLINE_DURATION_S
      ? []
      : lines.flatMap((line) => {
          const point = line.points[model.focus!]
          const hard = model.lines.find((l) => l.year === line.year)?.hard ?? false
          return line.labelled && point !== null && point !== undefined
            ? [{ year: line.year, hard, point }]
            : []
        })
  return {
    xs: model.durations.map(x),
    xTicks: fitTicks(durationTicks(first, last, x), {
      axis: 'x',
      width,
      keep: (tick) => tick.label === formatDuration(HEADLINE_DURATION_S),
    }),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    lines,
    labels: ends.map(({ year, end }, i) => ({
      year,
      x: end.x + LABEL_GAP_PX,
      y: spread[i]!,
    })),
    headline,
  }
}
