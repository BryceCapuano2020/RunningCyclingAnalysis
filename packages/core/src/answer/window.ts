import { startOfLocalDay } from '../calendar'
import type { AnalysisResult } from '../digest/combine'
import { DEFAULT_PERIOD_DAYS, splitPeriods, windowEnding } from '../period'
import type { PeriodChoice, WindowChoice } from '../period'
import type { ActivityDigest, Sport } from '../types'
import { SPORTS, hasEvidence, headlineShortfall } from './evidence'

/*
 * The default period is a search, so a page has one window and one set of numbers. The windows tried are the
 * shortest first: 12 weeks, 26 weeks, 12 months. A sport qualifies in a window when it has the activities and a
 * best 20 min the headline can use (evidence.ts) and that best was not shown easy. The first window where every sport the
 * athlete does qualifies is the one. Where none does, the shortest of those with evidence for every sport and the most
 * sports qualifying; where none has evidence for every sport, all time. An explicit pick is never searched.
 *
 * It stays cheap: the windows are analysed in order through the session's period cache, and the search stops at the
 * first that qualifies, so a library whose last 12 weeks hold a hard effort costs the analysis it always did. The
 * window it settles on is in the cache when the state asks for it.
 */

/** The windows the default tries, in days, shortest first: 12 weeks, 26 weeks, 12 months. */
export const WINDOW_DAYS: readonly number[] = [DEFAULT_PERIOD_DAYS, 26 * 7, 365]

/**
 * What a sport lacks in a window. `few`: fewer than the headline's activities counted. `none`: no best as long as the
 * headline's and no threshold. `easy`: it has them, and its best 20 min was shown not to be a hard effort.
 */
export type Lack = 'few' | 'none' | 'easy'

export interface SportLack {
  sport: Sport
  lack: Lack
}

/** A window the search passed over, and what the sports that did not qualify in it lacked. */
export interface PassedWindow {
  days: number
  lacks: SportLack[]
}

/**
 * Why the window is the one: `asked`, the athlete picked it. `qualified`, every sport qualifies in it. `most`, no window
 * qualified for every sport, and this is the shortest with evidence for every sport and the most sports qualifying.
 * `all-time`, no window had evidence for every sport.
 */
export type WindowReason = 'asked' | 'qualified' | 'most' | 'all-time'

/**
 * The window a page is on, never 'default', which the search resolves. An asked window is the pick itself, any choice but the
 * default; the others are a number of days or all time, with the shorter windows tried and passed over (shortest first;
 * none when the first was taken).
 */
export type AnswerWindow =
  | { reason: 'asked'; choice: Exclude<PeriodChoice, 'default'>; passed: [] }
  | { reason: Exclude<WindowReason, 'asked'>; choice: WindowChoice; passed: PassedWindow[] }

/** The window of a session with nothing to analyse: all time, which has no dates. */
export const NO_WINDOW: AnswerWindow = { reason: 'all-time', choice: 'all', passed: [] }

/** What a sport lacks in the analysis of a window, or null when it qualifies. */
function lackOf(result: AnalysisResult, sport: Sport, shortfall: number): Lack | null {
  if (shortfall > 0) return 'few'
  if (!hasEvidence(result, sport)) return 'none'
  return result.effortGate[sport].verdict === 'notHard' ? 'easy' : null
}

/** What each of the sports lacks in a window's analysis, leaving out those that qualify. */
function lacksIn(result: AnalysisResult, sports: readonly Sport[]): SportLack[] {
  const short = headlineShortfall(result.activities)
  return sports.flatMap((sport) => {
    const lack = lackOf(result, sport, short[sport])
    return lack === null ? [] : [{ sport, lack }]
  })
}

/** A window tried: the choice it dates, and what the sports lacked in it. */
interface Tried {
  choice: WindowChoice
  lacks: SportLack[]
}

/** The tried windows that are of dated lengths, as passed windows. */
function passedOf(tried: readonly Tried[]): PassedWindow[] {
  return tried.flatMap(({ choice, lacks }) => (choice === 'all' ? [] : [{ days: choice, lacks }]))
}

/**
 * The window a choice stands on. A pick other than the default is its own window. The default is searched: `analyse`
 * gives the analysis of the digests of a window (the session's cached `periods.analysis`), and is null where there is
 * nothing to analyse, which leaves the default on all time.
 *
 * A window longer than the library is all time (a library shorter than the window has no previous period to compare
 * with), so the search ends there with all time as its last window.
 */
export function resolveWindow(
  library: ActivityDigest[],
  choice: PeriodChoice,
  analyse: ((selected: ActivityDigest[]) => AnalysisResult) | null,
): AnswerWindow {
  if (choice !== 'default') return { choice, reason: 'asked', passed: [] }
  if (analyse === null || library.length === 0) return NO_WINDOW
  const first = library.reduce((low, d) => Math.min(low, d.startMs), Infinity)
  const newest = library.reduce((high, d) => Math.max(high, d.startMs), -Infinity)
  const sports = SPORTS.filter((sport) => library.some((d) => d.sport === sport))
  const tried: Tried[] = []
  // The shortest window with evidence for every sport and the most sports qualifying: the first of equals.
  let best: { index: number; qualifying: number } | null = null
  for (const days of WINDOW_DAYS) {
    const covered = startOfLocalDay(first) <= windowEnding(newest, days).startMs
    const window: WindowChoice = covered ? days : 'all'
    const lacks = lacksIn(analyse(splitPeriods(library, window).selected), sports)
    if (lacks.length === 0) {
      return { choice: window, reason: 'qualified', passed: passedOf(tried) }
    }
    const qualifying = sports.length - lacks.length
    if (
      lacks.every(({ lack }) => lack === 'easy') &&
      (best === null || qualifying > best.qualifying)
    ) {
      best = { index: tried.length, qualifying }
    }
    tried.push({ choice: window, lacks })
    if (!covered) break
  }
  if (best === null) return { choice: 'all', reason: 'all-time', passed: passedOf(tried) }
  return {
    choice: tried[best.index]!.choice,
    reason: 'most',
    passed: passedOf(tried.slice(0, best.index)),
  }
}
