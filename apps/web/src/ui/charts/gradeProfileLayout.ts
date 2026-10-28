import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import type { GradeProfile } from '../gradeProfile'
import type { SportGrade } from '../grades'
import { SPORT_ORDER } from '../sports'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale, logScale, niceDomain, tickDecimals } from './scale'
import { plotted } from './sharedTrendText'
import { fitTicks } from './ticks'

/** One duration the chart has a grade at, with each sport's grade there or none. */
export interface ProfileRow {
  durationS: number
  grades: Partial<Record<Sport, SportGrade>>
}

/** Whether a sport's grades are estimates with a range, as a ride's are: it is drawn dashed, with a band. */
export function isRanged(profile: GradeProfile, sport: Sport): boolean {
  return profile[sport].some((point) => point.grade.range !== null)
}

/** The sports that have a grade to draw, in the page's order. */
export function drawnSports(profile: GradeProfile): Sport[] {
  return SPORT_ORDER.filter((sport) => profile[sport].length > 0)
}

/** One row per duration either sport is graded at, shortest first. */
export function rowsOf(profile: GradeProfile): ProfileRow[] {
  const durations = new Set(
    SPORT_ORDER.flatMap((sport) => profile[sport].map((point) => point.durationS)),
  )
  return [...durations]
    .sort((a, b) => a - b)
    .map((durationS) => ({
      durationS,
      grades: Object.fromEntries(
        SPORT_ORDER.flatMap((sport) => {
          const point = profile[sport].find((candidate) => candidate.durationS === durationS)
          return point === undefined ? [] : [[sport, point.grade]]
        }),
      ),
    }))
}

/** A sport's marks, one per row: its grade, and the ends of its range where it has one and every sport is graded. */
export interface SportMarks {
  sport: Sport
  ranged: boolean
  centre: (Point | null)[]
  low: (Point | null)[]
  high: (Point | null)[]
}

export interface ProfileLayout {
  xs: number[]
  /** Where each row's tooltip is anchored: beside its first mark. */
  ys: (number | null)[]
  marks: SportMarks[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** A duration's tick, in whole minutes: the axis title says the unit, so the labels stay short at any width. */
const minutesLabel = (durationS: number): string => String(durationS / 60)

/** The 20 minute tick is the one the larger marker names, so thinning keeps it. */
const HEADLINE_TICK = minutesLabel(HEADLINE_DURATION_S)

/** The axis's title, which names the unit the tick labels leave off. */
export const DURATION_AXIS_TITLE = 'Duration (min, log scale)'

/** Every percent the rows draw, a range's ends included, so that the axis covers them all. */
function percentsOf(rows: readonly ProfileRow[]): number[] {
  return rows.flatMap((row) =>
    Object.values(row.grades).flatMap((grade) =>
      [grade.centre, grade.range?.low, grade.range?.high].flatMap((end) =>
        end === undefined ? [] : [plotted('grade', end.grade)],
      ),
    ),
  )
}

/**
 * A tick at each duration that has a grade, thinned to fit the width. Thinning keeps both ends and the
 * 20 minute tick, so a narrow chart still shows where it starts, where it stops and the length the balance
 * is at. Every duration stays in the tooltip and the table, whether or not its tick is drawn.
 */
function durationTicksOf(
  rows: readonly ProfileRow[],
  x: (durationS: number) => number,
  width: number,
): AxisTick[] {
  const ticks = rows.map((row) => ({
    position: x(row.durationS),
    label: minutesLabel(row.durationS),
  }))
  const kept = new Set([ticks[0]?.label, ticks.at(-1)?.label, HEADLINE_TICK])
  return fitTicks(ticks, { axis: 'x', width, keep: (tick) => kept.has(tick.label) })
}

/** The chart's marks and axes for these rows, or null with fewer than two durations to span. */
export function profileLayout(
  rows: readonly ProfileRow[],
  profile: GradeProfile,
  size: ChartSize,
): ProfileLayout | null {
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = logScale([first.durationS, last.durationS], [plot.left, plot.right])
  const { domain, ticks } = niceDomain(percentsOf(rows), 4, 0.05)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const decimals = tickDecimals(ticks)
  const sports = drawnSports(profile)
  // A range is drawn only where every sport has a grade, so it is never shown against nothing.
  const shared = rows.map((row) => sports.every((sport) => row.grades[sport] !== undefined))
  const marks = sports.map((sport): SportMarks => {
    const at = (pick: (grade: SportGrade) => number | undefined, onlyShared = false) =>
      rows.map((row, i): Point | null => {
        const grade = row.grades[sport]
        const value = grade === undefined || (onlyShared && !shared[i]) ? undefined : pick(grade)
        return value === undefined ? null : { x: x(row.durationS), y: y(plotted('grade', value)) }
      })
    return {
      sport,
      ranged: isRanged(profile, sport),
      centre: at((grade) => grade.centre.grade),
      low: at((grade) => grade.range?.low.grade, true),
      high: at((grade) => grade.range?.high.grade, true),
    }
  })
  return {
    xs: rows.map((row) => x(row.durationS)),
    ys: rows.map((_, i) => marks.map((m) => m.centre[i]?.y).find((v) => v !== undefined) ?? null),
    marks,
    xTicks: durationTicksOf(rows, x, width),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: `${tick.toFixed(decimals)}%` })),
      { axis: 'y', width },
    ),
  }
}
