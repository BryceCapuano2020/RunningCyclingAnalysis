import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
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

/** The efforts a threshold is estimated from, as copy: "3 to 20 min", the fit's own window. */
export const THRESHOLD_EFFORT_TEXT = `${CP_FIT_MIN_S / 60} to ${formatDuration(CP_FIT_MAX_S)}`

/** A threshold in plain words, for the card that shows it: what the number is. */
export const THRESHOLD_MEANING: Record<Sport, string> = {
  run: `The pace you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
  ride: `The power you could hold for a long, steady effort, estimated from your best ${THRESHOLD_EFFORT_TEXT} efforts.`,
}
