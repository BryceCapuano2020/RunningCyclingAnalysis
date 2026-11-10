import { withinText } from '../fitness/copy'
import { monthYear, SAY } from './copy'
import { mayStateHeld } from './lead'
import type { LiveState } from './lead'
import type { SportLookBack } from './compute'

/**
 * The words a sport's History row says: the finding of its years in one line, with a link to the History tab. Dated by
 * year, never "now", and nothing a card could contradict: a quiet stretch only as the stretch it was.
 */

const upper = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

/**
 * The section's finding for one sport, or null when its years have nothing to say. The longest quiet stretch leads, only
 * while the card allows saying a level held (`live`); else, with only bests, "Best efforts by year". A sport too short
 * for its years has none: its row says what it lacks.
 */
export function yearsFinding(sport: SportLookBack, live: LiveState = null): string | null {
  const years = sport.fitness
  if (years.kind === 'ok') {
    // "Stayed within" is a statement about the level that the card could contradict: only while the card allows it.
    const quiet = [...years.quiet].sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs))[0]
    if (quiet !== undefined && mayStateHeld(live)) {
      return `${upper(SAY[sport.sport].subject)} stayed within ${withinText(sport.sport, quiet.within)} from ${monthYear(quiet.fromMs)} to ${monthYear(quiet.toMs)}`
    }
  }
  // Only bests: a best that has stood is not a finding.
  if (sport.milestones.length > 0) return 'Best efforts by year'
  return null
}
