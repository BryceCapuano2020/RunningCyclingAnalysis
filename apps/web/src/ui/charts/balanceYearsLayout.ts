import type { Sport } from '@rca/core/types'
import { drawnIn } from './balanceYears'
import type { YearView } from './balanceYears'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { fitTicks } from './ticks'

/** The axis is age grade in per cent, 0 to 100. A grade past 100 widens it to the next 20. */
const AXIS_STEP = 20
const AXIS_TOP = 100

/** A grade as the per cent the axis counts in. */
const percent = (grade: number): number => grade * 100

/** A sport's marks, one for each year: its grade, and the ends of its range where it has one. */
export interface YearMarks {
  sport: Sport
  centre: (Point | null)[]
  low: (Point | null)[]
  high: (Point | null)[]
  /** Whether the sport has a range, as an estimate does: it is drawn as a band. */
  ranged: boolean
}

export interface YearsLayout {
  /** The pixel x of each year, centred in its room. */
  xs: number[]
  marks: YearMarks[]
  /** Where each year's tooltip sits: beside its first mark, else the middle of the plot. */
  ys: (number | null)[]
  /** A range too short to join its neighbours is drawn on its own, from its low end to its high. */
  whiskers: { sport: Sport; x: number; top: number; bottom: number }[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** The top of the axis: 100, or higher for a run graded past it, in whole steps. */
function axisTop(views: readonly YearView[]): number {
  const highest = Math.max(
    ...views.flatMap((view) =>
      Object.values(view.grades).map((each) =>
        percent(each.grade.range?.high.grade ?? each.grade.centre.grade),
      ),
    ),
  )
  return Math.max(AXIS_TOP, Math.ceil(highest / AXIS_STEP) * AXIS_STEP)
}

/**
 * One equal room for each calendar year, with the year's grades at its middle on one 0 to 100 scale. A year with no
 * grade is an empty room, and breaks the line there. Null without a grade to draw.
 */
export function yearsLayout(views: readonly YearView[], size: ChartSize): YearsLayout | null {
  const sports = drawnIn(views)
  if (sports.length === 0) return null
  const { plot, width } = size
  const top = axisTop(views)
  const y = linearScale([0, top], [plot.bottom, plot.top])
  const room = (plot.right - plot.left) / views.length
  const xs = views.map((_, i) => plot.left + room * (i + 0.5))
  const marks = sports.map((sport): YearMarks => {
    const at = (
      pick: (grade: NonNullable<YearView['grades'][Sport]>['grade']) => number | undefined,
    ) =>
      views.map((view, i): Point | null => {
        const each = view.grades[sport]
        const value = each === undefined ? undefined : pick(each.grade)
        return value === undefined ? null : { x: xs[i]!, y: y(percent(value)) }
      })
    return {
      sport,
      ranged: views.some((view) => view.grades[sport]?.grade.range != null),
      centre: at((grade) => grade.centre.grade),
      low: at((grade) => grade.range?.low.grade),
      high: at((grade) => grade.range?.high.grade),
    }
  })
  const whiskers = marks
    .filter((mark) => mark.ranged)
    .flatMap((mark) =>
      mark.high.flatMap((high, i) => {
        const low = mark.low[i]
        const joined = mark.high[i - 1] != null || mark.high[i + 1] != null
        return high == null || low == null || joined
          ? []
          : [{ sport: mark.sport, x: high.x, top: high.y, bottom: low.y }]
      }),
    )
  const ticks = Array.from({ length: top / AXIS_STEP + 1 }, (_, i) => i * AXIS_STEP)
  return {
    xs,
    marks,
    ys: views.map((_, i) => marks.map((mark) => mark.centre[i]?.y).find((v) => v != null) ?? null),
    whiskers,
    xTicks: fitTicks(
      views.map((view, i) => ({ position: xs[i]!, label: String(view.year) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: `${tick}%` })),
      { axis: 'y', width },
    ),
  }
}
