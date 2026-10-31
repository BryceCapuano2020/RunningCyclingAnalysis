import { PRIORS } from '../../constants'
import { combine } from '../../digest/combine'
import type { AnalysisResult } from '../../digest/combine'
import { digestActivity } from '../../digest/digestActivity'
import type { SyntheticAthlete } from '../../synthetic'
import type { Sport } from '../../types'
import { athleteFor, birthYearFor, libraryOf, truthCp } from './libraries'
import type { AthleteOptions, LibraryKind, LibraryOptions } from './libraries'

/** One arm of the sweep: who the athletes are, what they train, and what the analysis is told about them. */
export interface Arm {
  /** The primary sport's training; a second entry adds the other sport to the library. */
  training: readonly { kind: LibraryKind; sport: Sport; options?: LibraryOptions }[]
  athlete?: AthleteOptions
  /** Whether the settings carry the year of birth (when the athlete's maximum gives a plausible age). */
  age?: 'known' | 'unknown'
  /** A maximum heart rate the athlete entered, as a share of the true one. */
  entered?: number
}

/** What an arm gives for one athlete. */
export interface Draw {
  result: AnalysisResult
  athlete: SyntheticAthlete
  /** The primary sport's fit against the truth, as a share of the truth, and its regression error likewise; null when withheld. */
  error: number | null
  se: number | null
}

/** The ride's critical power as the analysis measures it: the generator's efficiency against the prior mean's. */
export function truthRideCp(athlete: SyntheticAthlete): number {
  return (athlete.cpRide * athlete.grossEfficiency) / PRIORS.grossEfficiency.mean
}

/** Runs the arm for one athlete (seed). */
export function drawOf(arm: Arm, seed: number): Draw {
  const athlete = athleteFor(seed, arm.athlete)
  const digests = arm.training.flatMap(({ kind, sport, options }) =>
    libraryOf(kind, athlete, seed, sport, options).map((a) => digestActivity(a)),
  )
  const birthYear = arm.age === 'known' ? birthYearFor(athlete, seed) : null
  const result = combine(digests, {
    massKg: 75,
    bikeMassKg: 9,
    ...(birthYear === null ? {} : { birthYear }),
    ...(arm.entered === undefined
      ? {}
      : {
          measurements: (['run', 'ride'] as const).map((sport) => ({
            kind: 'maxHeartRate' as const,
            sport,
            value: athlete.hrMax * arm.entered!,
            from: '2020-01-01',
          })),
        }),
  })
  const primary = arm.training[0]!.sport
  const fit = { run: result.runCp, ride: result.rideCp }[primary]
  const truth = { run: truthCp(athlete), ride: truthRideCp(athlete) }[primary]
  return {
    result,
    athlete,
    error: fit === null ? null : (fit.cp - truth) / truth,
    se: fit === null ? null : fit.cpSe / truth,
  }
}

/** Every draw of an arm over seeds 1 to n. */
export function runArm(arm: Arm, n: number): Draw[] {
  return Array.from({ length: n }, (_, i) => drawOf(arm, i + 1))
}

/** The Wilson 95% interval for a share, n trials. */
export function wilson(successes: number, n: number): [low: number, high: number] {
  const z = 1.96
  const p = successes / n
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}
