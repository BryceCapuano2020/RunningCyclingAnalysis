import type { AgeProfile } from '@rca/core/grade'
import type { BalanceYear } from '@rca/core/history'
import { standingOfYears } from '@rca/core/standing'
import type { YearGrade as CoreYearGrade } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import type { Lean } from '../../domain/lean'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'

/** A sport's threshold of one year, graded as an hour at the age on its strongest day, with whether the gate found the year's best 20 minutes hard. */
export type YearGrade = CoreYearGrade

/** One calendar year of the chart. A year with no threshold in either sport is an empty room, so the axis is unbroken. */
export interface YearView {
  year: number
  grades: Partial<Record<Sport, YearGrade>>
  /** The sports whose threshold is at the top of the age tables (a ride can be): no grade of its own, left out of the comparison. */
  atTop: Sport[]
  /** Who led, by the rule of the Balance hero; null unless both sports are graded. */
  leader: Lean | null
}

/** Which sport's grade waits for the body weight, as the hero's does: a ride is priced by it. */
const WAITS_FOR_WEIGHT: Record<Sport, boolean> = { run: false, ride: true }

/**
 * Every calendar year from the first with a threshold to the last, each sport graded as the hero grades it (core's
 * `standingOfYears`: the threshold as an hour, at the age on the day of its strongest effort), with an empty room for a year between.
 * A ride waits for the weight, as the hero's does (`weightKnown`).
 */
export function yearViews(
  years: readonly BalanceYear[],
  profile: AgeProfile,
  weightKnown: boolean,
): YearView[] {
  const first = years[0]?.year
  const last = years.at(-1)?.year
  if (first === undefined || last === undefined) return []
  const graded = standingOfYears(
    years,
    profile,
    SPORT_ORDER.filter((sport) => weightKnown || !WAITS_FOR_WEIGHT[sport]),
  )
  const byYear = new Map(graded.map((row) => [row.year, row]))
  return Array.from({ length: last - first + 1 }, (_, i): YearView => {
    const year = first + i
    const row = byYear.get(year)
    return {
      year,
      grades: row?.grades ?? {},
      atTop: row?.atTop ?? [],
      leader: row?.lead?.lean ?? null,
    }
  })
}

/** The sports with a grade in at least one year, in the page's order. */
export function drawnIn(views: readonly YearView[]): Sport[] {
  return SPORT_ORDER.filter((sport) => views.some((view) => view.grades[sport] !== undefined))
}

/** Whether any year has a grade to draw. */
export const hasGrades = (views: readonly YearView[]): boolean => drawnIn(views).length > 0

/** Whether a year's best was found not to be an all-out effort: its dot is hollow. */
export const isHollow = (grade: YearGrade): boolean => grade.verdict === 'notHard'

/** The chart's title: what it plots, which is one sport's grade or both sports' (the title never says who led). */
export function chartTitle(views: readonly YearView[]): string {
  const drawn = drawnIn(views)
  return drawn.length === 1
    ? `${SPORT_LABEL[drawn[0]!]} grade by year`
    : 'Grade by year, run and ride'
}
