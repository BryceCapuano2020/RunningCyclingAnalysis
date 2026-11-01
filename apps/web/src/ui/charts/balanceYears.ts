import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortVerdict } from '@rca/core/effort'
import { gradeEffort } from '@rca/core/grade'
import type { AgeProfile, SportGrade } from '@rca/core/grade'
import { speedOfBest } from '@rca/core/history'
import type { BalanceYear } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { Lean } from '../../domain/lean'
import { balanceGap } from '../balanceGap'
import { SPORT_ORDER, SPORT_TITLE } from '../sports'

/** A sport's best 20 minutes of one year, graded at the age on its day, with whether the gate found it hard. */
export interface YearGrade {
  grade: SportGrade
  verdict: EffortVerdict
}

/** One calendar year of the chart. A year with no best in either sport is an empty room, so the axis is unbroken. */
export interface YearView {
  year: number
  grades: Partial<Record<Sport, YearGrade>>
  /** The sports whose best is at the top of the age tables (a ride can be): no grade of its own, left out of the comparison. */
  atTop: Sport[]
  /** Who led, by the rule of the Balance hero; null unless both sports are graded. */
  leader: Lean | null
}

/** Which sport's grade waits for the body weight, as the hero's does: a ride is priced by it. */
const WAITS_FOR_WEIGHT: Record<Sport, boolean> = { run: false, ride: true }

/**
 * Every calendar year from the first with a best to the last, each sport graded as the hero grades it
 * (`gradeEffort`, at the age on the day of the best). A ride waits for the weight, as the hero's does (`weightKnown`).
 */
export function yearViews(
  years: readonly BalanceYear[],
  profile: AgeProfile,
  weightKnown: boolean,
): YearView[] {
  const first = years[0]?.year
  const last = years.at(-1)?.year
  if (first === undefined || last === undefined) return []
  const byYear = new Map(years.map((row) => [row.year, row]))
  return Array.from({ length: last - first + 1 }, (_, i): YearView => {
    const year = first + i
    const grades: YearView['grades'] = {}
    const atTop: Sport[] = []
    for (const sport of SPORT_ORDER) {
      const best = byYear.get(year)?.sports[sport]
      if (best == null || (WAITS_FOR_WEIGHT[sport] && !weightKnown)) continue
      const outcome = gradeEffort(
        sport,
        { speed: speedOfBest(best), started: best },
        HEADLINE_DURATION_S,
        profile,
      )
      if (outcome.kind === 'graded') grades[sport] = { grade: outcome.grade, verdict: best.verdict }
      else if (outcome.kind === 'top-of-scale') atTop.push(sport)
    }
    const [run, ride] = SPORT_ORDER.map((sport) => grades[sport])
    return {
      year,
      grades,
      atTop,
      leader: run && ride ? balanceGap(run.grade, ride.grade).lean : null,
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

const LEVEL_TITLE = 'Running and cycling were level every year'

/**
 * The chart's title: the finding of the years in which both sports are graded. One sport leading every year, or
 * every year until one it did not; else how many years each led. With fewer than two such years, the metric.
 */
export function titleOf(views: readonly YearView[]): string {
  const compared = views.flatMap(({ year, leader }) => (leader === null ? [] : [{ year, leader }]))
  const drawn = drawnIn(views)
  if (compared.length < 2) {
    return drawn.length === 1 ? `${SPORT_TITLE[drawn[0]!]} age grade by year` : 'Age grade by year'
  }
  const leaders = compared.map((view) => view.leader)
  const first = leaders[0]!
  const turn = leaders.findIndex((leader) => leader !== first)
  if (turn === -1) return first === 'even' ? LEVEL_TITLE : `${SPORT_TITLE[first]} led every year`
  // A sport that led the first years and none after: the year that ended it is the finding.
  if (first !== 'even' && turn >= 2 && leaders.slice(turn).every((leader) => leader !== first)) {
    return `${SPORT_TITLE[first]} led every year until ${compared[turn]!.year}`
  }
  const wins = SPORT_ORDER.map((sport) => ({
    sport,
    n: leaders.filter((leader) => leader === sport).length,
    latest: leaders.lastIndexOf(sport),
  })).sort((a, b) => b.n - a.n || b.latest - a.latest)[0]!
  return `${SPORT_TITLE[wins.sport]} led in ${wins.n} of ${compared.length} years`
}
