import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import { countedPhrase, heldAction, needLine } from '../components/headlineNeed'
import { HEADLINE_MIN_ACTIVITIES, headlineShortfall } from '../components/pickHeadline'
import { HARDER_EFFORTS_TITLE, levelsTitle } from '../components/headlineText'
import { plural } from '../components/plural'
import { IMPLAUSIBLE_RIDE_TEXT } from '../grades'
import { betweenClause } from '../periodCopy'
import { countEfforts, countSport } from '../records'

/** The count under the lede when either sport has few efforts; null when both have enough, or one is missing. */
export function fewEffortsText(result: AnalysisResult): string | null {
  const runs = countEfforts(result.activities, 'run')
  const rides = countEfforts(result.activities, 'ride')
  if (
    runs === 0 ||
    rides === 0 ||
    (runs >= HEADLINE_MIN_ACTIVITIES && rides >= HEADLINE_MIN_ACTIVITIES)
  )
    return null
  return `From ${plural(runs, 'run')} and ${plural(rides, 'ride')}. Add more runs or rides for a steadier answer.`
}

export interface Missing {
  title: string
  detail: string
  /** Whether All time would show something the period leaves out. */
  canShowAll: boolean
}

/** Neither sport is in the period on screen: what All time holds, or that the files hold neither. */
function noneOnScreen(libraryRuns: number, libraryRides: number, when: string): Missing {
  if (libraryRuns + libraryRides > 0) {
    return {
      title: `No runs or rides${when}`,
      detail: `You have ${plural(libraryRuns, 'run')} and ${plural(libraryRides, 'ride')} in All time.`,
      canShowAll: true,
    }
  }
  return {
    title: 'Add a run and a ride to see your balance',
    detail: 'Your files have no running or cycling activities yet.',
    canShowAll: false,
  }
}

/** The title while the ride's power is flagged and there is no run level to lead with. */
const IMPLAUSIBLE_TITLE = 'Your ride power looks implausible'

/** What is missing before the two sports can be compared, in the period on screen. */
export function missingText(
  result: AnalysisResult,
  library: ActivitySummary[],
  period: Period,
  levels: { run: string | null; ride: string | null },
  rideImplausible = false,
): Missing {
  const runs = countSport(result.activities, 'run')
  const rides = countSport(result.activities, 'ride')
  const libraryRuns = countSport(library, 'run')
  const libraryRides = countSport(library, 'ride')
  // All time names no period; a dated one says which dates it is missing a sport between.
  const when = period.days === null ? '' : ` ${betweenClause(period)}`
  if (runs > 0 && rides === 0) {
    if (libraryRides > 0) {
      return {
        title: `No rides${when}`,
        detail: `You have ${plural(libraryRides, 'ride')} in All time.`,
        canShowAll: true,
      }
    }
    // One sport: its level is the title, and the one thing to do is the line under it.
    const title = levelsTitle({ run: levels.run })
    return {
      title: title ?? 'Add a ride to see your balance',
      detail: title ? 'Add a ride to compare it with your running.' : 'Your run results are below.',
      canShowAll: false,
    }
  }
  if (rides > 0 && runs === 0) {
    if (libraryRuns > 0) {
      return {
        title: `No runs${when}`,
        detail: `You have ${plural(libraryRuns, 'run')} in All time.`,
        canShowAll: true,
      }
    }
    const title = levelsTitle({ ride: levels.ride })
    return {
      title: title ?? 'Add a run to see your balance',
      detail: title ? 'Add a run to compare it with your cycling.' : 'Your ride results are below.',
      canShowAll: false,
    }
  }
  if (runs === 0 && rides === 0) return noneOnScreen(libraryRuns, libraryRides, when)
  // Both sports are here, and the ride is the one flagged: say so rather than ask for harder efforts.
  if (rideImplausible) {
    return {
      title: levelsTitle({ run: levels.run }) ?? IMPLAUSIBLE_TITLE,
      detail: IMPLAUSIBLE_RIDE_TEXT,
      canShowAll: false,
    }
  }
  return heldMissing(result, library, period, levels)
}

/**
 * The two sports are both on file but cannot be compared: the counts the headline's rule counts, then what is missing.
 * A dated period short of activities may find enough in All time.
 */
function heldMissing(
  result: AnalysisResult,
  library: ActivitySummary[],
  period: Period,
  levels: { run: string | null; ride: string | null },
): Missing {
  const action = heldAction(result, period)
  const allTimeEnough =
    needLine(headlineShortfall(result.activities), period, result.activities) !== null &&
    period.days !== null &&
    needLine(headlineShortfall(library), period, library) === null
  const runs = countedPhrase(result.activities, 'run')
  const rides = countedPhrase(result.activities, 'ride')
  return {
    // The levels the files do show are the title; "not enough" is the title only when there is none to show.
    title: levelsTitle(levels) ?? HARDER_EFFORTS_TITLE,
    detail: `From ${runs} and ${rides}. ${action}`,
    canShowAll: allTimeEnough,
  }
}
