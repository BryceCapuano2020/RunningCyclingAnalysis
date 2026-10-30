import type { Sport } from '../types'

/** The sports findings are made for, in the order detectors are run. */
export const FINDING_SPORTS: readonly Sport[] = ['run', 'ride']

/**
 * The bar a finding must clear to be spoken, and the numbers its ranking and statistics share. The
 * speaking bar is strict on purpose: a finding is rarer and more trusted than a number on a page.
 */
export const FINDINGS = {
  /**
   * The findings an athlete-year, new ones, that every detector together may speak in a library where nothing
   * changes. A bar per finding does not bound the number of false ones as detectors are added, so each declares a
   * share (`Detector.alarmBudget`) and the registry refuses a set whose shares add to more than this.
   */
  familyBudgetPerYear: 0.5,
  /** Confidence at least this (see score.ts). */
  minConfidence: 0.8,
  /** Surprise at least this, before any damping, for a finding to be spoken for the first time. */
  minSurprise: 0.4,
  /** ... and its effect must lie this many spreads from what is usual for the athlete (see surpriseOf). */
  minSurpriseZ: 2.5,
  /** A finding already being spoken stays while its surprise holds above this: it must not flicker at the bar. */
  stayFloor: 0.25,
  /** A candidate whose newest evidence is older than this many weeks before the evaluation is not current. */
  staleWeeks: 8,
  /** A finding shows again when its effect has moved by this share of what was shown, or changed sign. */
  materialChange: 0.5,
  /** A step in the share of activities with heart rate or measured power of this many points is a change of source. */
  sourceShift: 0.3,
  /** ... and the activities each side must bear it out at this many standard errors. */
  sourceStepZ: 3.5,
  /** A finding is spoken only when it clears the bar at this many weekly evaluations in a row. */
  consecutiveEvaluations: 2,
  /** The share of weeks with nothing new to say that a real library should reach. Checked by hand, not in CI. */
  quietShare: 0.6,
  /** Bootstrap draws for an interval. Seeds come from seedFrom, so that no two statistics share a stream. */
  bootstrapDraws: 400,
  /** Weekly changes in the history that surprise is judged against, and the fewest that can judge. */
  noiseWeeks: 26,
  minNoiseWeeks: 8,
  /** With less history than noiseWeeks, rarity is unknown and surprise is capped here. */
  shortHistorySurpriseCap: 0.6,
  /** Surprise is damped for a finding of the same sign shown within this many weeks, and lifted on a reversal. */
  continuationWeeks: 12,
  continuedFactor: 0.4,
  reversalFactor: 1.25,
  /** Ranking: no kind twice in the top three unless the second scores at least this. */
  topCount: 3,
  repeatKindScore: 0.9,
  /** The most findings kept for each sport. A sport page shows 5, and 10 more collapsed. */
  maxPerSport: 15,
  /** A comparison with a relative effect is fingerprinted to this many parts per hundred. */
  fingerprintStep: 0.01,
} as const

/** A value for each sport. Adding a sport to the type makes this stop compiling until it is given one. */
export function perSport<T>(make: (sport: Sport) => T): Record<Sport, T> {
  return { run: make('run'), ride: make('ride') }
}
