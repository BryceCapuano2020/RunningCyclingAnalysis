import type { AnswerWindow } from '@rca/core/answer'
import type { Period } from '@rca/core/period'
import type { Property } from './components/property'
import { latestActivityAge } from './periodCopy'
import { sameAsShorter } from './periodSame'
import { windowFacts } from './windowLine'

/** The first letter capitalised, for a clause that becomes a row's value. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The notes on a period as a detail panel's rows (docs/design/system.md, Detail panels), one fact each: why the default
 * passed over a shorter window ("Last 12 weeks": "Too few rides"), the shorter period that holds the same activities, and how
 * old the newest activity is. A sport page passes the window alone, since it has no library-wide notes.
 */
export function periodNoteRows(
  window: AnswerWindow,
  library?: { activities: readonly { startMs: number }[]; period: Period; newestMs: number | null },
): Property[] {
  const facts = windowFacts(window)
  const same = library === undefined ? null : sameAsShorter(library.activities, library.period)
  const age = library === undefined ? null : latestActivityAge(library.newestMs)
  return [
    ...(facts === null ? [] : [{ label: `Last ${facts.length}`, value: capital(facts.lacked) }]),
    ...(same === null ? [] : [{ label: 'Same activities as', value: `${same.length} to latest` }]),
    ...(age === null ? [] : [{ label: 'Latest activity', value: age }]),
  ]
}
