import { formatCount } from '../format/count'
import type { ImportOutcome } from '../../worker/protocol'
import { plural } from '../components/plural'

/**
 * What an import says of the export's activities.csv, when files were given loose. With the list: how many of the
 * files it names were in this import, said only when some were not (a subset is the athlete's to give, so it is news,
 * not a fault). Without it: that a list from the same export gives the files their sport, said only when a file was
 * refused for want of one. Null when there is nothing to say.
 */
export function looseListLine(outcome: Pick<ImportOutcome, 'listed' | 'needsList'>): string | null {
  const { listed, needsList } = outcome
  if (listed !== undefined) {
    return listed.received >= listed.named
      ? null
      : `Your activities.csv lists ${plural(listed.named, 'file')}; ${formatCount(listed.received)} ${listed.received === 1 ? 'was' : 'were'} in this import.`
  }
  return needsList === true
    ? 'Add activities.csv from the same export to give these their sport.'
    : null
}
