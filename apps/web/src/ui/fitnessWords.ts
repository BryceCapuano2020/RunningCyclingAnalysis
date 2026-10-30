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
    reading: () => 'five-minute blocks',
    stretch: () => 'one five-minute block to the next',
    steadyMeaning: (hr) =>
      `A ride with a power meter and heart rate, whose five-minute blocks within ${FITNESS.ride.hrHalfBand} bpm of ${hr} bpm are read.`,
    leftOut: (hr) =>
      `The others had no power meter, or too little riding within ${FITNESS.ride.hrHalfBand} bpm of ${hr} bpm.`,
  },
}
