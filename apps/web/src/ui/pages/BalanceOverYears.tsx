import { useMemo } from 'react'
import type { BalanceYear } from '@rca/core/history'
import { BalanceOverYearsChart } from '../charts/BalanceOverYearsChart'
import { hasGrades, yearViews } from '../charts/balanceYears'
import { HEADLINE_LABEL } from '../grades'
import type { AgeGap, AgeProfile } from '../grades'
import { hrefFor } from '../route'

export interface BalanceOverYearsProps {
  /** Each calendar year's best 20 minutes, from the History of the whole library. */
  years: readonly BalanceYear[]
  profile: AgeProfile | null
  /** The year of birth or sex the grades still need; null when both are given. */
  missingAge: AgeGap | null
  weightKnown: boolean
  /**
   * Where it sits. On the History page it says in a line what is missing when there is nothing to draw. On the home
   * page it is a card under the tiles and stays silent, since the page has its own prompts.
   */
  placement: 'history' | 'home'
}

/**
 * The age grade of each calendar year, run and ride, graded as the Balance hero grades its window. It draws nothing
 * until a year has a grade; the History page then says what to add, and the home page stays silent.
 */
export function BalanceOverYears({
  years,
  profile,
  missingAge,
  weightKnown,
  placement,
}: BalanceOverYearsProps) {
  // The profile is built afresh on each render, so the views are kept on its two values.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const views = useMemo(
    () =>
      birthYear === null || sex === null ? [] : yearViews(years, { birthYear, sex }, weightKnown),
    [years, birthYear, sex, weightKnown],
  )
  const home = placement === 'home'
  if (hasGrades(views)) {
    const chart = <BalanceOverYearsChart views={views} />
    return home ? <div className="balance__panel">{chart}</div> : chart
  }
  if (home) return null
  if (profile === null && missingAge !== null) {
    return (
      <div className="history__prompt">
        <p className="muted">{`Age grade by year needs your ${missingAge}.`}</p>
        <a className="btn" href={hrefFor({ page: 'profile' })}>
          {`Add your ${missingAge}`}
        </a>
      </div>
    )
  }
  return (
    <p className="muted">{`Add a run or ride of ${HEADLINE_LABEL} or more to grade each year.`}</p>
  )
}
