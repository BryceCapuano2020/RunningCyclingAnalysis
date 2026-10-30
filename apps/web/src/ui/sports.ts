import {
  CP_FIT_MAX_S,
  CP_FIT_MIN_S,
  CP_FIT_REACH_TOLERANCE,
  THRESHOLD_HOLD_S,
} from '@rca/core/constants'
import type { CriticalPowerRefusal, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPace, formatPower, paceSeconds, PACE_UNIT } from '@rca/core/units'
import { PER } from './format/units'

/**
 * The sports in the order they sit everywhere: the card row, the balance meter and the share card.
 * The first is on the left, so running is on the left and cycling on the right.
 */
export const SPORT_ORDER = ['run', 'ride'] as const

/**
 * What differs between the sports, in one place. A sport's own number is its flat pace for running,
 * a speed read as a pace, and its power for cycling, in watts. Keyed by Sport, so a sport added to
 * SPORT_ORDER must say each of these.
 */
export interface SportFormat {
  /** The own number in a heading, legend or tooltip: "Flat pace" or "Power". */
  nativeLabel: string
  /** The own number's unit spelt out after a chart's name: "flat pace per kilometre", "power in watts". */
  titleUnit: (units: UnitSystem) => string
  /** Whether the values also state their mechanical W/kg. Running names only its activity. */
  showsWkg: boolean
  /** The shape a chart marks the sport's points with. Rides are diamonds, so the sports differ in shape. */
  glyph: 'dot' | 'diamond'
  /** The grade's name on a ladder. A ride's grade is estimated through its running equivalent. */
  gradeName: string
  /** The vertical axis's title. Pace says which way is faster, since its axis runs the other way. */
  axisTitle: (units: UnitSystem) => string
  /** The own number on a vertical axis: seconds per unit for running, so a faster pace is smaller. */
  plotted: (value: number, units: UnitSystem) => number
  /** The own number as text, with its unit. */
  formatted: (value: number, units: UnitSystem) => string
  /** Whether a chart fills the area under its line. Watts fill down to zero; pace does not. */
  fillsArea: boolean
}

export const SPORT_FORMAT: Record<Sport, SportFormat> = {
  run: {
    nativeLabel: 'Flat pace',
    titleUnit: (units) => `flat pace ${PER[units]}`,
    showsWkg: false,
    glyph: 'dot',
    gradeName: 'Age grade',
    axisTitle: (units) => `Flat pace (${PACE_UNIT[units]}), faster up`,
    plotted: (speedMs, units) => paceSeconds(speedMs, units),
    formatted: (speedMs, units) => formatPace(speedMs, units),
    fillsArea: false,
  },
  ride: {
    nativeLabel: 'Power',
    titleUnit: () => 'power in watts',
    showsWkg: true,
    glyph: 'diamond',
    gradeName: 'Estimated age grade',
    axisTitle: () => 'Power (W)',
    plotted: (watts) => watts,
    formatted: (watts) => formatPower(watts),
    fillsArea: true,
  },
}

/** The name of each sport on screen: a tab, a card heading, a chart title, a legend or a table heading. */
export const SPORT_LABEL: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/**
 * The sport as the word that opens a sentence, such as "Running grades 6 points higher than cycling".
 * Titles and labels use SPORT_LABEL.
 */
export const SPORT_TITLE: Record<Sport, string> = { run: 'Running', ride: 'Cycling' }

/** The sport as the noun in a sentence, lower case, such as "running and cycling in balance". */
export const SPORT_NOUN: Record<Sport, string> = { run: 'running', ride: 'cycling' }

export const SPORT_PLURAL: Record<Sport, string> = { run: 'runs', ride: 'rides' }

/** The sport as the activity in a phrase about its hours: "your running and riding hours". */
export const SPORT_DOING: Record<Sport, string> = { run: 'running', ride: 'riding' }

/** One activity of the sport as the noun in a sentence, lower case: "this run", "this ride". */
export const SPORT_ACTIVITY: Record<Sport, string> = { run: 'run', ride: 'ride' }

/** The label over a sport's estimated threshold, on its card and its page. */
export const THRESHOLD_LABEL: Record<Sport, string> = {
  run: 'Threshold pace, estimated',
  ride: 'Threshold power, estimated',
}

/** A sport's threshold as the name over its figure; the chip beside it says whether it is estimated. */
export const THRESHOLD_HEADING: Record<Sport, string> = {
  run: 'Threshold pace',
  ride: 'Threshold power',
}

/**
 * The label over a threshold the fit refused, when the lowest of the bests it left out is shown in its place.
 * That is a held best and a floor, not an estimate, so it is not called one.
 */
export const THRESHOLD_FLOOR_LABEL: Record<Sport, string> = {
  run: 'Threshold pace, at least',
  ride: 'Threshold power, at least',
}

/** The shortest and longest efforts as copy: "3" and "20 min", the fit's own window. */
const EFFORT_MIN_TEXT = `${CP_FIT_MIN_S / 60}`
const EFFORT_MAX_TEXT = formatDuration(CP_FIT_MAX_S)
/** The efforts a threshold is estimated from, as copy: "3 to 20 min", the fit's own window. */
export const THRESHOLD_EFFORT_TEXT = `${EFFORT_MIN_TEXT} to ${EFFORT_MAX_TEXT}`
/** The longest effort a fit has to reach, s: its window's end less the tolerance. */
const THRESHOLD_REACH_S = CP_FIT_MAX_S * (1 - CP_FIT_REACH_TOLERANCE)
const EFFORT_BETWEEN = `between ${EFFORT_MIN_TEXT} and ${EFFORT_MAX_TEXT}`

/**
 * What a threshold's place says when there is none: the efforts are missing, or they are there but
 * show no threshold, so a harder one is asked for.
 */
export const THRESHOLD_NEEDS_TEXT: Record<CriticalPowerRefusal, string> = {
  missing: `Needs efforts ${EFFORT_BETWEEN}`,
  shape: `Needs a harder effort ${EFFORT_BETWEEN}`,
  // The effort gate's refusal has a fuller line (thresholdWithheld), which says what the best 20 minutes did reach.
  effort: `Needs a hard ${EFFORT_MAX_TEXT} effort`,
}

/**
 * The line for a missing threshold, by why its fit is refused. No reason means missing efforts. The fit has to
 * reach its longest effort, so when the sport has efforts in the window and none that long, the line asks for
 * the long one and names the longest held, rather than asking for efforts the card lists.
 */
export function thresholdNeedsText(
  refusal: CriticalPowerRefusal | null,
  longestHeldS: number | null = null,
): string {
  const reason = refusal ?? 'missing'
  if (reason === 'missing' && longestHeldS !== null && longestHeldS < THRESHOLD_REACH_S) {
    return `Needs an effort of about ${EFFORT_MAX_TEXT}. Your longest so far is ${formatDuration(longestHeldS)}.`
  }
  return THRESHOLD_NEEDS_TEXT[reason]
}

/**
 * A threshold in plain words, shown under its number: what the number is, as an estimate ("About")
 * with the efforts it rests on.
 */
export const THRESHOLD_MEANING: Record<Sport, string> = {
  run: `About the pace you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
  ride: `About the power you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
}

/**
 * What a threshold is, in one line under its tile's name: the figure it gives, and for how long it can be held: the
 * time the fit supports (`THRESHOLD_HOLD_S`), not an hour.
 */
export const THRESHOLD_GLOSS: Record<Sport, string> = {
  run: `Pace you could hold for about ${formatDuration(THRESHOLD_HOLD_S)}`,
  ride: `Power you could hold for about ${formatDuration(THRESHOLD_HOLD_S)}`,
}
