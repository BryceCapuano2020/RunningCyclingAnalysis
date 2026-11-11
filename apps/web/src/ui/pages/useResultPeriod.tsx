import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Property } from '../components/property'
import type { ActivitySummary } from '@rca/core/pipeline'
import { periodDays, sameChoice } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'
import { periodDates } from '../components/rangeOptions'
import { usePeriodRail } from '../components/PeriodRail'
import { countsOf, countsOfState, notCountedHref } from '../activityCounts'
import { usePeriodChoice } from '../periodPreference'
import { countSport } from '../records'
import { hrefFor } from '../route'
import type { Route } from '../route'
import type { PeriodView } from '../analysis/views'
import { periodNoteRows } from '../periodNoteRows'

export interface ResultPeriodInput {
  route: Route
  analysis: PeriodView
  /** Every activity on file, counted or not. */
  library: ActivitySummary[]
  /** What the analysis rests on: the library less the runs at walking pace. */
  analysed: ActivitySummary[]
  /** Every activity on file that started in the period. */
  inPeriod: ActivitySummary[]
}

export interface ResultPeriod {
  /** Picks a period the way the rail does, so the choice is kept on this device. */
  pickPeriod: (choice: PeriodChoice, answered?: (reply: unknown) => void) => void
  /** The rail's periods on a page the period moves, else null. */
  periods: ReactNode
  /** The period's status and Custom form for under the page title, on the same pages, else null. */
  caption: ReactNode
  /** The period's dates, counts and notes as a detail panel's rows, for the page's Details; none off those pages. */
  rows: Property[]
}

/**
 * The period on the result pages: the choice kept on this device and sent to the analysis, and the control that
 * changes it, as the rail's choices and the caption under the page title. Balance and the sport pages have one; a
 * sport page with none of its sport on file does not, since the period would change nothing on it.
 */
export function useResultPeriod({
  route,
  analysis,
  library,
  analysed,
  inPeriod,
}: ResultPeriodInput): ResultPeriod {
  const { period } = analysis.state
  const setRange = analysis.setRange
  const [storedChoice, storeChoice] = usePeriodChoice()
  // Library and sample loads are told the period picked on this device. Files analysed while the
  // account loads are not, so for them it is sent once there is a result to show it on.
  // The choice already sent and not yet answered, so a pick is sent once: storing it changes
  // `storedChoice` before the analysis's period catches up, which the effect would send again.
  const sent = useRef<{ choice: PeriodChoice; shownWas: PeriodChoice } | null>(null)
  useEffect(() => {
    // The period on screen moved, so whatever was sent has been answered, or replaced by a load.
    if (sent.current !== null && !sameChoice(sent.current.shownWas, period.choice))
      sent.current = null
    if (sameChoice(period.choice, storedChoice)) return
    if (sent.current !== null && sameChoice(sent.current.choice, storedChoice)) return
    sent.current = { choice: storedChoice, shownWas: period.choice }
    setRange(storedChoice)
  }, [period.choice, storedChoice, setRange])

  const pickPeriod = (choice: PeriodChoice, answered?: (reply: unknown) => void) => {
    storeChoice(choice)
    sent.current = { choice, shownWas: period.choice }
    setRange(choice, answered)
  }
  const sport = route.page === 'run' || route.page === 'ride' ? route.page : null
  // Balance counts every activity on file and links the count to them; it says when a longer period repeats a
  // shorter one, and how old the newest activity is. A sport page counts its own sport's.
  const newestMs = analysed.reduce<number | null>(
    (newest, activity) =>
      newest === null || activity.startMs > newest ? activity.startMs : newest,
    null,
  )
  const counts = sport === null ? countsOfState(analysis.state) : countsOf(library, sport)
  const rail = usePeriodRail({
    choice: period.choice,
    resolved: analysis.state.answerWindow.choice,
    range: periodDays(period),
    dates: periodDates(period),
    noteRows: periodNoteRows(
      analysis.state.answerWindow,
      sport === null ? { activities: analysed, period, newestMs } : undefined,
    ),
    shown: sport === null ? inPeriod.length : countsOf(inPeriod, sport).onFile,
    total: counts.onFile,
    notCounted: counts.notCounted,
    noun: sport ?? undefined,
    countHref: sport === null ? hrefFor({ page: 'activities' }) : undefined,
    notCountedHref: notCountedHref(sport ?? undefined),
    busy: analysis.busy,
    onChange: pickPeriod,
  })
  const shown = route.page === 'balance' || (sport !== null && countSport(analysed, sport) > 0)
  return {
    pickPeriod,
    periods: shown ? rail.periods : null,
    caption: shown ? rail.caption : null,
    rows: shown ? rail.rows : [],
  }
}
