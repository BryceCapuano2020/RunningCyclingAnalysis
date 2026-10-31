import { DAY_MS } from '@rca/core/constants'
import { FITNESS, fitnessLines } from '@rca/core/fitness'
import type { FitnessBySport, FitnessState, FitnessStatus, Ranged } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FITNESS_WORDS } from './fitnessWords'
import { SPORT_FORMAT, SPORT_ORDER } from './sports'

/** The shapes that say a state without colour: each is drawn by FitnessGlyph. */
export type FitnessGlyphKey =
  | 'slipping'
  | 'holding'
  | 'holding-below'
  | 'recovering'
  | 'back'
  | 'improving'
  | 'improved'
  | 'waiting'

/** What each state is called on screen, and the shape that stands for it. */
export const FITNESS_STATE: Record<FitnessState, { label: string; glyph: FitnessGlyphKey }> = {
  slipping: { label: 'Slipping', glyph: 'slipping' },
  holding: { label: 'Holding', glyph: 'holding' },
  'holding-below': { label: 'Holding below', glyph: 'holding-below' },
  recovering: { label: 'Recovering', glyph: 'recovering' },
  back: { label: 'Back', glyph: 'back' },
  improving: { label: 'Improving', glyph: 'improving' },
  improved: { label: 'Improved', glyph: 'improved' },
  'not-enough-evidence': { label: 'Not enough evidence yet', glyph: 'waiting' },
}

/** The two ends of the track, in the words of each sport's output: "slower" and "faster", "less" and "more". */
const SIDES: Record<Sport, { less: string; more: string }> = {
  run: { less: 'Slower', more: 'Faster' },
  ride: { less: 'Less', more: 'More' },
}

/** Where the change sits against the level before it, as a share of a track that is `span` wide either way of "before". */
export interface FitnessTrackModel {
  /** The change as a position on the track, -1 at the "less" end to 1 at the "more" end. */
  at: number
  low: number
  high: number
  /** Where the low was, for a recovery: how far from "before" the athlete fell, in the same units. */
  floor: number | null
  less: string
  more: string
  /** The level before the change, as the athlete reads it: "7:27 /km". */
  before: string
  now: string
}

/** The track's half-width never shrinks below this fraction of change, so a small change reads as small. */
const TRACK_MIN_SPAN = 0.12
/** And it grows in steps of this much, with this much room round the widest end, so that the scale changes rarely. */
const TRACK_STEP = 0.04
const TRACK_ROOM = 1.15

/** A progress shape for a status that waits on counts: how many steady runs it has of how many it needs. */
export interface FitnessProgress {
  have: number
  need: number
  /** What is counted, in words: "steady runs over 8 different weeks". */
  of: string
}

export interface FitnessView {
  sport: Sport
  state: FitnessState
  label: string
  glyph: FitnessGlyphKey
  headline: string
  support: string
  /** A change that began to be shown within the last weeks: "the week of 12 Oct". Null otherwise. */
  fresh: string | null
  track: FitnessTrackModel | null
  progress: FitnessProgress | null
  status: FitnessStatus
}

const WEEK_MS = 7 * DAY_MS
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FRESH_STATES = new Set<FitnessState>(['slipping', 'recovering', 'back'])

/** The Monday of the week a state was first shown (it is entered at the week's end), written in UTC as the weeks are. */
function weekOf(entryMs: number): string {
  const monday = new Date(entryMs - 6 * DAY_MS)
  return `the week of ${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}`
}

/** A figure keeps its unit on its line: a pace and its "/km" are one word to the eye. */
const tidy = (text: string) => text.replace(/(\d) (\/(?:km|mi))/g, '$1\u00a0$2')

/** The seasonal swing taken out of a status, said as a size on either side ("up to 2.1% either side"), or null when none was. */
export function seasonSwing(status: FitnessStatus): string | null {
  const swing = status.evidence?.method.seasonal ?? null
  return swing === null ? null : `up to ${(swing * 100).toFixed(1)}% either side`
}

/** Whether a status has anything to say on screen: a state, or a count of what it is waiting for. */
export function worthShowing(status: FitnessStatus): boolean {
  const { shortfall } = status
  if (status.state !== 'not-enough-evidence') return true
  if (shortfall === null || shortfall.kind === 'unavailable') return false
  // No steady run at all: a library of treadmill runs or of rides says nothing, so the page does not ask for more.
  return status.steady > 0
}

/**
 * The track of a change, with the low a recovery fell to when it has one. It is a shape: its positions are the
 * change in output (speed for a run), where the sentence's percentages are in pace, as the athlete reads them, so the
 * two differ by a point or so at 7% (a pace 7.1% slower is a speed 6.7% lower) and neither is wrong. `before` and `now` are the levels as
 * the athlete reads them, or empty where a figure has no units to be read in.
 */
export function trackModel(
  sport: Sport,
  change: Ranged,
  gain: Ranged | null,
  levels: { before: string; now: string },
): FitnessTrackModel {
  // The low a recovery fell to, against "before": the level now divided by what has been regained since.
  const floor = gain === null ? null : (1 + change.value) / (1 + gain.value) - 1
  const widest = Math.max(
    Math.abs(change.low),
    Math.abs(change.high),
    floor === null ? 0 : Math.abs(floor),
  )
  const span = Math.max(TRACK_MIN_SPAN, Math.ceil((widest * TRACK_ROOM) / TRACK_STEP) * TRACK_STEP)
  const place = (r: number) => Math.max(-1, Math.min(1, r / span))
  return {
    at: place(change.value),
    low: place(change.low),
    high: place(change.high),
    floor: floor === null ? null : place(floor),
    less: SIDES[sport].less,
    more: SIDES[sport].more,
    ...levels,
  }
}

/** The track of a status that has a change to show, or null. */
export function trackOf(status: FitnessStatus, units: UnitSystem): FitnessTrackModel | null {
  const { change, now, before, gain } = status
  if (
    status.state === 'not-enough-evidence' ||
    change === null ||
    now === null ||
    before === null
  ) {
    return null
  }
  const format = SPORT_FORMAT[status.sport].formatted
  return trackModel(status.sport, change, gain, {
    before: format(before, units),
    now: format(now, units),
  })
}

/** What a status that is waiting on counts has of them, for the progress shape, or null when it counts nothing. */
export function progressOf(status: FitnessStatus): FitnessProgress | null {
  const { shortfall } = status
  if (status.state !== 'not-enough-evidence' || shortfall === null) return null
  const words = FITNESS_WORDS[status.sport]
  if (shortfall.kind === 'history') {
    return {
      have: shortfall.have,
      need: shortfall.need,
      of: `${words.steadyPlural} before the last ${FITNESS.monitor.refEndWeeks} weeks`,
    }
  }
  if (shortfall.kind === 'recent') {
    return {
      have: shortfall.have,
      need: shortfall.need,
      of: `${words.steadyPlural} in the last ${shortfall.weeks} weeks`,
    }
  }
  return null
}

/** The sentence a waiting status opens with, which its label says instead. */
const WAITING_OPENER = /^Not enough (?:recent )?evidence yet\.\s*/

/** What a waiting status is called: "recent" when it is the last weeks that are short, not the history. */
function waitingLabel(status: FitnessStatus): string {
  const kind = status.shortfall?.kind
  return kind === 'recent' || kind === 'break'
    ? 'Not enough recent evidence yet'
    : FITNESS_STATE['not-enough-evidence'].label
}

export function viewOf(status: FitnessStatus, units: UnitSystem): FitnessView {
  const { glyph } = FITNESS_STATE[status.state]
  const waiting = status.state === 'not-enough-evidence'
  const label = waiting ? waitingLabel(status) : FITNESS_STATE[status.state].label
  const lines = fitnessLines(status, units)
  if (waiting) lines.headline = lines.headline.replace(WAITING_OPENER, '')
  const fresh =
    status.entered !== null &&
    FRESH_STATES.has(status.state) &&
    status.asOfMs - status.entered.atMs < FITNESS.display.freshWeeks * WEEK_MS
      ? weekOf(status.entered.atMs)
      : null
  return {
    sport: status.sport,
    state: status.state,
    label,
    glyph,
    headline: tidy(lines.headline),
    support: tidy(lines.support),
    fresh,
    track: trackOf(status, units),
    progress: progressOf(status),
    status,
  }
}

/** The statuses worth showing, in the order the sports sit everywhere, as what the page draws. */
export function fitnessViews(fitness: FitnessBySport, units: UnitSystem): FitnessView[] {
  return SPORT_ORDER.flatMap((sport) =>
    worthShowing(fitness[sport]) ? [viewOf(fitness[sport], units)] : [],
  )
}
