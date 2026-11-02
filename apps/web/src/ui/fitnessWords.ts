import { FITNESS } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'

const U = FITNESS.unit

/** A kilometre in miles, to a tenth: "0.6" is where kilometre 2 starts, "6.2" where kilometre 10 ends. */
const MILES = (kilometres: number) => (kilometres * 0.621371).toFixed(1)

/**
 * What the sport's fitness copy says, in one table keyed by sport. A run is read in whole kilometres whatever unit the
 * athlete counts in, so for miles the copy gives the distance in the athlete's unit beside the kilometres it reads, and
 * never says a mile where it measured a kilometre.
 */
export interface FitnessWords {
  output: string
  steady: string
  steadyPlural: string
  activity: string
  activities: string
  /** What the athlete did at the reference heart rate, past tense: "ran" or "rode". */
  did: string
  /** What each figure is adjusted for: a run for the heart rate and the climb, a ride (a power meter reads the hill itself) for the heart rate. */
  adjusted: string
  /** What the status can see, said once: the size of change it finds reliably and the one it finds usually, against the spread from one activity to the next. */
  promise: string
  /** What is read of one steady run, in the athlete's units: "kilometres 2 to 10 (0.6 to 6.2 miles in)". */
  reading: (units: UnitSystem) => string
  /** The change of pace between one stretch of a run and the next, which a steady run keeps small. */
  stretch: (units: UnitSystem) => string
  /** What a steady run is, for the note on the term. */
  steadyMeaning: (hr: number | null, units: UnitSystem) => string
  /** Why some of an athlete's activities are not steady ones. */
  leftOut: (hr: number | null, units: UnitSystem) => string
}

const KM_FIRST = U.firstKm + 1
const KM_LAST = U.lastKm + 1

const run = {
  reading: (units: UnitSystem) =>
    units === 'imperial'
      ? `kilometres ${KM_FIRST} to ${KM_LAST} (from ${MILES(KM_FIRST - 1)} to ${MILES(KM_LAST)} miles into the run)`
      : `kilometres ${KM_FIRST} to ${KM_LAST}`,
  stretch: (units: UnitSystem) =>
    units === 'imperial' ? `one kilometre (0.6 mi) to the next` : 'one kilometre to the next',
}

export const FITNESS_WORDS: Record<Sport, FitnessWords> = {
  run: {
    output: 'Pace',
    steady: 'steady run',
    steadyPlural: 'steady runs',
    activity: 'run',
    activities: 'runs',
    did: 'ran',
    adjusted: 'the heart rate and the climb of each',
    promise:
      'A change of 8% it sees within weeks, reliably. A change of 5% it usually sees within a few months, and not always. Anything smaller sits inside the spread from one run to the next, about 4%, and is not reported. In your first two years, an athlete with a strong season can see about one false "Slipping" every two years, then about one every four.',
    ...run,
    steadyMeaning: (hr, units) =>
      `A run outdoors with heart rate on file, where pace changes by about ${Math.round(U.maxPaceChange * 100)}% or less from ${run.stretch(units)}. Its ${run.reading(units)} are read: the ones within ${U.hrHalfBand} bpm of ${hr} bpm and with little climb, at least ${U.minKm} of them. Intervals, hilly runs and treadmill runs do not count.`,
    leftOut: (hr, units) =>
      `The others were on a treadmill, had no heart rate or one that was set aside, changed pace from ${run.stretch(units)} (intervals, tempo work, a race), or had too little flat running within ${U.hrHalfBand} bpm of ${hr} bpm.`,
  },
  ride: {
    output: 'Power',
    steady: 'steady ride',
    steadyPlural: 'steady rides',
    activity: 'ride',
    activities: 'rides',
    did: 'rode',
    adjusted: 'the heart rate of each',
    promise:
      'A change of 8% it usually sees within three months. A change of 5% it often takes longer to see, and does not always. Anything smaller sits inside the spread from one ride to the next, 2% to 5%, and is not reported. In your first two years, an athlete with a strong season can see about one false "Slipping" every two years, then about one every four.',
    reading: () => 'five-minute blocks',
    stretch: () => 'one five-minute block to the next',
    steadyMeaning: (hr) =>
      `A ride outdoors with a power meter and heart rate on file. Its five-minute blocks within ${FITNESS.ride.hrHalfBand} bpm of ${hr} bpm are read, at least ${FITNESS.ride.minBlocks} of them. Rides are not tested for steadiness, so any pace counts.`,
    leftOut: (hr) =>
      `The others were indoors, had no power meter, no heart rate or one that was set aside, or had too little riding within ${FITNESS.ride.hrHalfBand} bpm of ${hr} bpm.`,
  },
}

/** What a library's one sport needs before it has a fitness status at all, said as a line when the page has no card to show. */
export const FITNESS_LACK_LINE: Record<Sport, string> = {
  run: 'Fitness needs heart rate. Add runs recorded with a strap or watch.',
  ride: 'Fitness needs power. Add rides recorded with a power meter.',
}

/**
 * The same line for a library whose every activity of the sport was indoors, where the fitness reading skips them (it reads
 * a run's kilometre splits, and a treadmill's belt speed is not a distance covered): it asks for outdoor ones.
 */
export const FITNESS_LACK_INDOOR_LINE: Partial<Record<Sport, string>> = {
  run: 'Fitness skips treadmill runs. Add runs recorded outdoors with a strap or watch.',
}
