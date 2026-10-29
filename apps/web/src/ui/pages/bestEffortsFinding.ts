import { plural } from '../components/plural'
import type { BestEffortRows } from './bestEffortRows'

/** What the closed row says: how many bests are listed, so the row tells the athlete there is more behind it. */
export function bestEffortsFinding(list: BestEffortRows): string {
  return `${plural(list.rows.length, 'best effort', 'best efforts')} with their levels, and the activity each was set in.`
}
