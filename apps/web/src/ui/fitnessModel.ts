import { fitnessLines } from '@rca/core/fitness'
import type { FitnessBySport, FitnessState, FitnessStatus } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { latestActivityAge, latestActivityText } from './periodCopy'
import { SPORT_ORDER } from './sports'

export interface FitnessView {
  sport: Sport
  state: FitnessState
  /** The level, number first. */
  headline: string
  support: string
  /** What a trend needs, for a status that cannot call one. Empty otherwise. */
  needs: string
  /** How old the status is, once its newest activity is long ago by the clock: "Latest activity 9 months ago." Null while it is recent. */
  age: string | null
  /** How long ago the newest activity was, "9 months ago", once it is long ago; null while recent. */
  ago: string | null
  status: FitnessStatus
}

/** A figure keeps its unit on its line: a pace and its "/km" are one word to the eye. */
const tidy = (text: string) => text.replace(/(\d) (\/(?:km|mi))/g, '$1\u00a0$2')

/** The seasonal swing taken out of a status, said as a size on either side ("up to 2.1% either side"), or null when none was. */
export function seasonSwing(status: FitnessStatus): string | null {
  const swing = status.evidence?.method.seasonal ?? null
  return swing === null ? null : `up to ${(swing * 100).toFixed(1)}% either side`
}

/** Whether the athlete's warm days were added back to the runs behind a status (revision 7, once their files carry a temperature). */
export function adjustedForWarmDays(status: FitnessStatus): boolean {
  return status.evidence?.method.heat !== undefined
}

/** Whether a status has anything to say on screen: a state, or a count of what it is waiting for. */
export function worthShowing(status: FitnessStatus): boolean {
  const { shortfall } = status
  if (status.state !== 'not-enough-evidence') return true
  if (shortfall === null || shortfall.kind === 'unavailable') return false
  // No steady run at all: a library of treadmill runs or of rides says nothing, so the page does not ask for more.
  return status.steady > 0
}

/**
 * What a status is drawn as. The status itself is as of the newest activity; `nowMs` is the clock, read here for display
 * only: a state is new for a few weeks of today, and a library last written to long ago says how old it is.
 */
export function viewOf(status: FitnessStatus, units: UnitSystem, nowMs: number): FitnessView {
  const lines = fitnessLines(status, units)
  const age = latestActivityText(status.asOfMs, nowMs)
  return {
    sport: status.sport,
    state: status.state,
    headline: tidy(lines.headline),
    support: tidy(lines.support),
    needs: tidy(lines.needs),
    age: age === null ? null : `${age}.`,
    ago: latestActivityAge(status.asOfMs, nowMs),
    status,
  }
}

/** The headline, its support and its age as one line, for a sport that is a line on the page rather than a card. */
export const lineOf = (view: FitnessView): string =>
  [view.headline, view.support, view.age ?? ''].filter((part) => part !== '').join(' ')

/** Whether any sport has a status worth drawing. */
export const hasFitnessView = (fitness: FitnessBySport): boolean =>
  SPORT_ORDER.some((sport) => worthShowing(fitness[sport]))

/** The statuses worth showing, in the order the sports sit everywhere, as what the page draws. */
export function fitnessViews(
  fitness: FitnessBySport,
  units: UnitSystem,
  nowMs: number,
): FitnessView[] {
  return SPORT_ORDER.flatMap((sport) =>
    worthShowing(fitness[sport]) ? [viewOf(fitness[sport], units, nowMs)] : [],
  )
}
