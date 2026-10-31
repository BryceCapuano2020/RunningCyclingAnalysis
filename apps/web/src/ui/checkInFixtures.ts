import type { CheckIn } from '@rca/core/lookback'

/** Synthetic: a library that added workouts since a baseline taken on 2 October 2025. */
export const QUIET_CHECK_IN: CheckIn = {
  // The baseline is an instant, told as the day it was on the reader's own clock; noon there is the same day in every zone.
  sinceMs: new Date(2025, 9, 2, 12).getTime(),
  added: { run: 14, ride: 3 },
  older: { run: null, ride: null },
  bests: [],
  fitness: [{ sport: 'run', kind: 'same', state: 'holding', within: 0.02 }],
  episodes: [],
  quiet: true,
}

export const BUSY_CHECK_IN: CheckIn = {
  ...QUIET_CHECK_IN,
  bests: [
    {
      sport: 'run',
      effort: { kind: 'duration', durationS: 1200 },
      unit: 'm/s',
      value: 3.52,
      previous: 3.4,
      atMs: Date.UTC(2025, 9, 14, 7),
      older: false,
    },
  ],
  quiet: false,
}
