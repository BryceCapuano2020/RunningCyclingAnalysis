import { plural } from '../components/plural'
import type { BestEffortRows } from './bestEffortRows'

/**
 * What the closed row says: how many bests are listed, with their levels only where they have any, so the row tells
 * the athlete there is more behind it and never promises what is not there.
 */
export function bestEffortsFinding(list: BestEffortRows): string {
  const count = plural(list.rows.length, 'best effort', 'best efforts')
  const levels = list.rows.some((row) => row.grade !== null)
  return `${count}${levels ? ' with their levels,' : ''} and the activity each was set in`
}
