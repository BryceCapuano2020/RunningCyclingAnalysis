import type { Sport } from '@rca/core/types'

/** The name of each sport in text, shown beside its SportIcon. */
export const SPORT_LABEL: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/** The full name of each sport as a title, such as a chart legend entry or a table heading. */
export const SPORT_TITLE: Record<Sport, string> = { run: 'Running', ride: 'Cycling' }

/** The sport as the noun in a sentence, such as "All running records". */
export const SPORT_NOUN: Record<Sport, string> = { run: 'running', ride: 'cycling' }

export const SPORT_PLURAL: Record<Sport, string> = { run: 'runs', ride: 'rides' }

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
