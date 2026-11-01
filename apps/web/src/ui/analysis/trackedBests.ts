import { bestValue, effortName } from '@rca/core/lookback'
import type { MilestoneEffort, NewBest } from '@rca/core/lookback'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { MovedItem } from './whatMoved'

/** A new best the records rule found, with the effort it is at, so it can be matched with the check-in's. */
export interface KeyedBest {
  key: string
  item: MovedItem
}

/** The key of a run's or ride's best at a length of time. */
export const durationKey = (sport: Sport, durationS: number): string => `${sport}:d${durationS}`

/** The key of a run's best over a distance. */
export const distanceKey = (distanceM: number): string => `run:m${distanceM}`

const keyOfEffort = (sport: Sport, effort: MilestoneEffort): string =>
  effort.kind === 'duration' ? durationKey(sport, effort.durationS) : distanceKey(effort.distanceM)

/**
 * The new bests the list names. With a check-in (`tracked`), its bests are the list: "since your last import" and this
 * list say one thing about a best, so a best the check-in does not list is not called new here, and one it lists
 * is. Each reads as the records word it where they found it, else from the check-in's own figures. With none, the records'.
 */
export function bestsAgreeing(
  found: readonly KeyedBest[],
  tracked: readonly NewBest[] | null,
  sports: readonly Sport[],
  system: UnitSystem,
): MovedItem[] {
  if (tracked === null) return found.map((best) => best.item)
  return tracked
    .filter((best) => sports.includes(best.sport))
    .map((best) => {
      const key = keyOfEffort(best.sport, best.effort)
      const own = found.find((candidate) => candidate.key === key)
      if (own !== undefined) return own.item
      const name = effortName(best.effort)
      const sport = best.effort.kind === 'duration' ? ` ${best.sport}` : ''
      return { text: `New best ${name}${sport}: ${bestValue(best, best.value, system)}` }
    })
}
