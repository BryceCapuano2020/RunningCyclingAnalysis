import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '@rca/core/constants'
import type { CriticalPowerRefusal, Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'

/**
 * The sports in the order they sit everywhere: the card row, the balance meter and the share card.
 * The first is on the left, so running is on the left and cycling on the right.
 */
export const SPORT_ORDER = ['run', 'ride'] as const

/** The name of each sport in text, shown beside its SportIcon. */
export const SPORT_LABEL: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/** The full name of each sport as a title, such as a chart legend entry or a table heading. */
export const SPORT_TITLE: Record<Sport, string> = { run: 'Running', ride: 'Cycling' }

/** The sport as the noun in a sentence, such as "running and cycling in balance". */
export const SPORT_NOUN: Record<Sport, string> = { run: 'running', ride: 'cycling' }

export const SPORT_PLURAL: Record<Sport, string> = { run: 'runs', ride: 'rides' }

/** The heading of a sport's best-effort curve, in the sport's own unit: pace for running, power for riding. */
export const CURVE_TITLE: Record<Sport, string> = { run: 'Pace curve', ride: 'Power curve' }

/** A sport's threshold as the noun in a sentence, lower case: the card's "Running threshold pace". */
export const THRESHOLD_NOUN: Record<Sport, string> = {
  run: 'threshold pace',
  ride: 'threshold power',
}

/** The label over a sport's estimated threshold, on its card and its page. */
export const THRESHOLD_LABEL: Record<Sport, string> = {
  run: 'Threshold pace, estimated',
  ride: 'Threshold power, estimated',
}

/** The shortest and longest efforts as copy: "3" and "20 min", the fit's own window. */
const EFFORT_MIN_TEXT = `${CP_FIT_MIN_S / 60}`
const EFFORT_MAX_TEXT = formatDuration(CP_FIT_MAX_S)
/** The efforts a threshold is estimated from, as copy: "3 to 20 min", the fit's own window. */
export const THRESHOLD_EFFORT_TEXT = `${EFFORT_MIN_TEXT} to ${EFFORT_MAX_TEXT}`
const EFFORT_BETWEEN = `between ${EFFORT_MIN_TEXT} and ${EFFORT_MAX_TEXT}`

/**
 * What a threshold's place says when there is none: the efforts are missing, or they are there but
 * show no threshold, so a harder one is asked for.
 */
export const THRESHOLD_NEEDS_TEXT: Record<CriticalPowerRefusal, string> = {
  missing: `Needs efforts ${EFFORT_BETWEEN}`,
  shape: `Needs a harder effort ${EFFORT_BETWEEN}`,
}

/** The line for a missing threshold, by why its fit is refused. No reason means missing efforts. */
export function thresholdNeedsText(refusal: CriticalPowerRefusal | null): string {
  return THRESHOLD_NEEDS_TEXT[refusal ?? 'missing']
}

/**
 * A threshold in plain words, shown under its number: what the number is, as an estimate ("About")
 * with the efforts it rests on.
 */
export const THRESHOLD_MEANING: Record<Sport, string> = {
  run: `About the pace you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
  ride: `About the power you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
}
