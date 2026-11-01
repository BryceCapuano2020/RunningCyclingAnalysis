import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { Sport } from '@rca/core/types'
import { countedPhrase, needLine } from '../components/headlineNeed'
import { heldTexts } from '../resultHold'
import type { HoldInputs } from '../resultHold'
import { HEADLINE_MIN_ACTIVITIES, headlineShortfall } from '../components/pickHeadline'
import { HARDER_EFFORTS_TITLE, levelsTitle } from '../components/headlineText'
import { plural } from '../components/plural'
import { POWER_IMPLAUSIBLE_TEXT, POWER_IMPLAUSIBLE_TITLE } from '../analysis/powerCheckCopy'
import { TOP_OF_SCALE_TEXT } from '../grades'
import { rideOutOf } from '../rideLeftOut'
import type { RideLeftOut } from '../rideLeftOut'
import { leftOutNote } from '../analysis/walkingPaceCopy'
import { betweenClause } from '../periodCopy'
import { countEfforts, countSport, hasThreshold } from '../records'
import { otherSport } from '../soleSport'
import { SPORT_ACTIVITY, SPORT_NOUN, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { basisOf, notHardWords, uncheckedWords } from '../effortWords'
import { thresholdNeedsLine } from '../thresholdNeeds'

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

/** What a ride left out of the comparison says, and the title it takes when there is no run level to lead with. */
const LEFT_OUT: Record<RideLeftOut, { title: string; detail: string }> = {
  'top-of-scale': {
    title: 'Your cycling is at the top of the age tables',
    detail: TOP_OF_SCALE_TEXT,
  },
  'implausible-power': { title: POWER_IMPLAUSIBLE_TITLE, detail: POWER_IMPLAUSIBLE_TEXT },
}

/**
 * What would confirm a level that rests on a best 20 minutes the gate did not show hard: the gate's own action (a harder
 * effort, a reference, or a heart rate to check it). Empty when the level is confirmed, so a graded sport is never
 * asked for more than the gate asks.
 */
function gateAsk(result: AnalysisResult, sport: Sport): string {
  const gate = result.effortGate[sport]
  if (basisOf(gate) === null) return ''
  return gate.verdict === 'notHard'
    ? notHardWords(sport, gate, 'confirm the level').action
    : (uncheckedWords(sport, gate)?.action ?? '')
}

/**
 * A period that holds one sport. When the library holds the other sport elsewhere, that is the news (with a way to see it).
 * When the library holds one sport, the page is that sport's: its level leads, never a request, and under it only what its
 * threshold still needs. What would add the other sport is the invitation at the page's foot, not this headline.
 */
function soleSportMissing(
  sport: Sport,
  result: AnalysisResult,
  library: ActivitySummary[],
  levels: { run: string | null; ride: string | null },
  when: string,
  leftOut: number,
  holdInputs: HoldInputs,
): Missing {
  const other = otherSport(sport)
  const inLibrary = countSport(library, other)
  if (inLibrary > 0) {
    return {
      title: `No ${SPORT_PLURAL[other]}${when}`,
      detail: `You have ${plural(inLibrary, SPORT_ACTIVITY[other])} in All time.`,
      canShowAll: true,
    }
  }
  const level = levelsTitle({ [sport]: levels[sport] })
  // Runs that are all at walking pace are the missing sport's: say how many, and that they can be counted.
  if (leftOut > 0) {
    return {
      title: level ?? leftOutTitle(leftOut),
      detail: leftOutNote(leftOut),
      canShowAll: false,
    }
  }
  // A sport with a level is graded, not held: the line under the level never asks for a harder effort, which would say the
  // grade is not there. What its threshold needs is said by the threshold's own tile.
  // While the library is only part of what was added, the other sport may be in the files that were not read: the
  // hold's own words say to finish the import, where a line about what the sport needs would send the athlete elsewhere.
  const partial = holdInputs.partialImport
  return {
    title: level ?? `Your ${SPORT_NOUN[sport]} so far`,
    detail:
      partial !== undefined && partial !== null
        ? `${partial.text} ${partial.action}`
        : level !== null
          ? gateAsk(result, sport)
          : hasThreshold(result, sport)
            ? ''
            : thresholdNeedsLine(result, sport),
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
  const present = SPORT_ORDER.filter((sport) => countSport(result.activities, sport) > 0)
  if (present.length === 1) {
    return soleSportMissing(present[0]!, result, library, levels, when, leftOut, holdInputs)
  }
  if (runs === 0 && rides === 0) return noneOnScreen(libraryRuns, libraryRides, when, leftOut)
  // Both sports are here, and the ride is out of the comparison: say why rather than ask for harder efforts.
  const out = rideOutOf(holdInputs)
  if (out !== null) {
    const said = LEFT_OUT[out]
    return {
      title: levelsTitle({ run: levels.run }) ?? said.title,
      detail: said.detail,
      canShowAll: false,
    }
  }
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
    title: levelsTitle(levels) ?? HARDER_EFFORTS_TITLE,
    detail: `From ${runs} and ${rides}. ${why}${action}`,
    canShowAll: allTimeEnough,
  }
}
