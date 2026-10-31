import type { Sport } from '@rca/core/types'

/**
 * The note a run's pace carries. The Flat mark on each run row is spelled out here, so it has its
 * meaning in words too.
 */
export const FLAT_PACE_NOTE = 'Flat pace: your pace allowing for hills, as if on level ground.'

/**
 * The note under a run's distance times when its splits are on the page too. The two are timed
 * differently on purpose: a distance time is race-like, from the clock including stops, and a split
 * is moving time.
 */
export const TIMING_NOTE = 'Distance times include stops. Splits are moving time.'

/** The same note while the splits show the device's recorded laps, whose timing it does not claim. */
export const TIMING_NOTE_LAPS = 'Distance times include stops.'

/** The note under splits where a steep descent has left a flat pace out. */
export const STEEP_DESCENT_NOTE =
  'Flat pace is left out where a steep descent would make it much slower than the pace you ran.'

/** The note a run's distance times carry: they are as run, and the pace curve allows for hills. */
export const DISTANCE_TIMES_NOTE =
  'Distance times are as run. The pace curve allows for hills, so they can differ.'

/** The note under a sport's grades: running's pace is flat, so it says so, and cycling has none. */
export const SPORT_NOTE: Partial<Record<Sport, string>> = { run: FLAT_PACE_NOTE }
