import type { BalanceYear } from '../history/balance'
import type { EffortVerdict } from '../effort'
import type { AgeProfile, SportGrade } from '../grade'
import { SPORTS } from '../types'
import type { Sport } from '../types'
import { balanceLead } from './lead'
import type { BalanceLead } from './lead'
import { gradeThreshold } from './standing'

/** A sport's threshold of one year, graded as an hour at the age on its strongest day, with the gate's verdict on the year's best 20 minutes. */
export interface YearGrade {
  grade: SportGrade
  verdict: EffortVerdict
}

/** One calendar year of the Balance over the years, as `sportStanding` states a period. */
export interface YearStanding {
  year: number
  grades: Partial<Record<Sport, YearGrade>>
  /** The sports whose threshold is at the top of the age tables (a ride can be): no grade of its own, left out of the lead. */
  atTop: Sport[]
  /** The run's grade lead over the ride's, by the one rule the hero leads by; null unless both sports are graded. */
  lead: BalanceLead | null
}

/**
 * Each year's thresholds graded as a period's are (`gradeThreshold`, an hour at the age on the day of the strongest effort), and the
 * lead between the sports when both are graded. `sports` names the sports to grade: the page leaves a ride out until it knows the
 * body mass, as the hero does. A year whose sports are all left out or have no grade still has its row, with no grades.
 */
export function standingOfYears(
  years: readonly BalanceYear[],
  profile: AgeProfile,
  sports: readonly Sport[],
): YearStanding[] {
  return years.map(({ year, sports: thresholds }): YearStanding => {
    const grades: YearStanding['grades'] = {}
    const atTop: Sport[] = []
    for (const sport of SPORTS.filter((each) => sports.includes(each))) {
      const found = thresholds[sport]
      if (found === null) continue
      const outcome = gradeThreshold(sport, { speed: found.speed, started: found }, profile)
      if (outcome.kind === 'graded')
        grades[sport] = { grade: outcome.grade, verdict: found.verdict }
      else if (outcome.kind === 'top-of-scale') atTop.push(sport)
    }
    const [run, ride] = SPORTS.map((sport) => grades[sport])
    return { year, grades, atTop, lead: run && ride ? balanceLead(run.grade, ride.grade) : null }
  })
}
