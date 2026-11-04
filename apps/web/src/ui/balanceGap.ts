import { balanceLead } from '@rca/core/standing'
import type { BalanceLead } from '@rca/core/standing'
import type { HeadlineGrades, SportGrade } from './grades'
import { BALANCE_PAIR } from './sports'

/** The first sport's age-grade lead over the second's, in whole points, with its range and the lean it gives (core's `balanceLead`). */
export type BalanceGap = BalanceLead

/** The gap between two sports' grades at one duration, by the one rule `sportStanding` leads by. */
export function balanceGap(first: SportGrade, second: SportGrade): BalanceGap {
  return balanceLead(first, second)
}

/**
 * The gap of two grades the page holds, when both sports are graded, or null. The surfaces that state the lean of a threshold read
 * `SportStanding.lead` itself; this is for grades at another length, which the grade profile compares.
 */
export function gapOfHeadline(headline: HeadlineGrades): BalanceGap | null {
  const [first, second] = BALANCE_PAIR
  const one = headline[first]
  const other = headline[second]
  if (one.kind !== 'graded' || other.kind !== 'graded') return null
  return balanceGap(one.grade, other.grade)
}
