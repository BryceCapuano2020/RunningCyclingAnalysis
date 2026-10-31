import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import { countedPhrase, needLine, unconfirmedSports } from '../components/headlineNeed'
import { heldTexts } from '../resultHold'
import type { HoldInputs } from '../resultHold'
import { HEADLINE_MIN_ACTIVITIES, headlineShortfall } from '../components/pickHeadline'
import { HARDER_EFFORTS_TITLE, levelsTitle } from '../components/headlineText'
import { plural } from '../components/plural'
import { leftOutNote } from '../analysis/walkingPaceCopy'
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

/** The headline when every run is at walking pace and left out, so the files hold runs the analysis cannot use. */
function leftOutTitle(leftOut: number): string {
  return leftOut === 1 ? 'Your run is at walking pace' : 'Your runs are at walking pace'
}

/** Neither sport is in the period on screen: what All time holds, or that the files hold neither. */
function noneOnScreen(
  libraryRuns: number,
  libraryRides: number,
  when: string,
  leftOut: number,
): Missing {
  if (libraryRuns + libraryRides > 0) {
    return {
      title: `No runs or rides${when}`,
      detail: `You have ${plural(libraryRuns, 'run')} and ${plural(libraryRides, 'ride')} in All time.`,
      canShowAll: true,
    }
  }
  // Runs that are all left out are not "no runs": say how many, and that they can be counted.
  if (leftOut > 0) {
    return { title: leftOutTitle(leftOut), detail: leftOutNote(leftOut), canShowAll: false }
  }
  return {
    title: 'Add a run and a ride to see your balance',
    detail: 'Your files have no running or cycling activities yet.',
    canShowAll: false,
  }
}

/**
 * What is missing before the two sports can be compared, in the period on screen. `leftOut` is how many runs
 * the files hold that are all at walking pace, 0 when there are none or some runs are analysed: a page with
 * no runs to use says it has runs it left out rather than that it has none.
 */
export function missingText(
  result: AnalysisResult,
  library: ActivitySummary[],
  period: Period,
  levels: { run: string | null; ride: string | null },
  leftOut = 0,
  holdInputs: HoldInputs = {},
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
    const title = levelsTitle({ run: levels.run }, unconfirmedSports(result))
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
    const title = levelsTitle({ ride: levels.ride }, unconfirmedSports(result))
    if (leftOut > 0) {
      return {
        title: title ?? leftOutTitle(leftOut),
        detail: leftOutNote(leftOut),
        canShowAll: false,
      }
    }
    return {
      title: title ?? 'Add a run to see your balance',
      detail: title ? 'Add a run to compare it with your cycling.' : 'Your ride results are below.',
      canShowAll: false,
    }
  }
  if (runs === 0 && rides === 0) return noneOnScreen(libraryRuns, libraryRides, when, leftOut)
  return heldMissing(result, library, period, levels, holdInputs)
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
  holdInputs: HoldInputs,
): Missing {
  // The hold says why and what lifts it; without one the action alone says which activities or which 20 minute effort a sport lacks.
  const { reason, action, hold } = heldTexts(result, period, holdInputs)
  const why = hold === null ? '' : `${reason} `
  const allTimeEnough =
    needLine(headlineShortfall(result.activities), period, result.activities) !== null &&
    period.days !== null &&
    needLine(headlineShortfall(library), period, library) === null
  const runs = countedPhrase(result.activities, 'run')
  const rides = countedPhrase(result.activities, 'ride')
  return {
    // The levels the files do show are the title; "not enough" is the title only when there is none to show.
    title: levelsTitle(levels, unconfirmedSports(result)) ?? HARDER_EFFORTS_TITLE,
    detail: `From ${runs} and ${rides}. ${why}${action}`,
    canShowAll: allTimeEnough,
  }
}
