import { ridePowerForRunSpeed } from '../digest/rideAnchor'
import {
  FIRST_GRADED_DISTANCE_M,
  LAST_GRADED_DISTANCE_M,
  ageGradeForEffort,
  gradeCeiling,
} from '../grade'
import type { Sex } from '../grade'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import { PRIORS } from '../constants'
import type { ThresholdEstimate } from '../threshold'
import { HOUR_S } from '../threshold/constants'
import type { Sport } from '../types'
import { paceSeconds } from '../units'
import type { UnitSystem } from '../units'
import { wholePercent } from './lead'

/**
 * What the lower sport's threshold would need to be to grade level with the higher sport's whole-percent grade, in the sport's own
 * unit (m/s of flat running speed for a run, watts for a ride) and named as the page names it: a pace to the whole second, watts
 * to a 5 W step, rounded toward the side that levels. A ride carries the equivalence's range; a run has one pace.
 */
export interface MatchFigure {
  higher: Sport
  lower: Sport
  /** The higher sport's whole-percent grade that the figure reaches. */
  wholePercent: number
  low: number
  centre: number
  high: number
  /** The lower sport's threshold now, in the same unit: the figure the page shows. */
  now: number
}

/** The athlete the figure is for: the age the lower sport was graded at, the sex, and the body mass today. */
interface Athlete {
  age: number
  sex: Sex
  massKg: number
}

interface Range {
  low: number
  centre: number
  high: number
}

/** The watts are named on a 5 W step; a pace is named to the whole second. */
const WATTS_STEP = 5
const MAX_PACE_STEPS = 3
const SPEED_STEPS = 25

/**
 * The flat speed, m/s, at which holding it for an hour grades at the target. Speed raises the distance covered, so the grade rises
 * with it and bisection finds the one speed. Null when no speed within the standards' distances reaches the target.
 */
function runSpeedAtGrade(grade: number, athlete: Athlete): number | null {
  const gradeAt = (speedMs: number) =>
    ageGradeForEffort(speedMs, HOUR_S, athlete.age, athlete.sex) ?? Number.NaN
  let lo = FIRST_GRADED_DISTANCE_M / HOUR_S
  let hi = LAST_GRADED_DISTANCE_M / HOUR_S
  if (!(gradeAt(lo) <= grade && grade <= gradeAt(hi))) return null
  for (let step = 0; step < SPEED_STEPS; step++) {
    const mid = (lo + hi) / 2
    if (gradeAt(mid) < grade) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** A pace named to the nearest whole second, and the faster second where the nearer one would grade a whole percent short. */
function namedPace(speedMs: number, units: UnitSystem, reach: number, athlete: Athlete): number {
  const metres = paceSeconds(1, units)
  const reaches = (seconds: number) =>
    wholePercent(ageGradeForEffort(metres / seconds, HOUR_S, athlete.age, athlete.sex) ?? 0) >=
    reach
  let seconds = Math.max(1, Math.round(paceSeconds(speedMs, units)))
  for (let step = 0; step < MAX_PACE_STEPS && seconds > 1 && !reaches(seconds); step++) seconds -= 1
  return metres / seconds
}

/** The lower sport's own figures that grade at the target, before they are named. */
const NATIVE_AT_GRADE: Record<Sport, (speedMs: number, athlete: Athlete) => Range> = {
  run: (speed) => ({ low: speed, centre: speed, high: speed }),
  ride: (speed, athlete) => ridePowerForRunSpeed(speed, athlete.massKg, athlete.sex),
}

/** The grade the inverse is worked out at: a run's exactly, so the pace is the one the run threshold names; a ride's whole percent. */
const INVERSE_GRADE: Record<Sport, (exact: number, whole: number) => number> = {
  run: (exact) => exact,
  ride: (_, whole) => whole,
}

/** A figure named as the page names it, rounded toward the side that levels. */
const NAMED: Record<
  Sport,
  (range: Range, units: UnitSystem, reach: number, athlete: Athlete) => Range
> = {
  run: (range, units, reach, athlete) => {
    const pace = namedPace(range.centre, units, reach, athlete)
    return { low: pace, centre: pace, high: pace }
  },
  ride: (range) => ({
    low: Math.floor(range.low / WATTS_STEP) * WATTS_STEP,
    centre: Math.ceil(range.centre / WATTS_STEP) * WATTS_STEP,
    high: Math.ceil(range.high / WATTS_STEP) * WATTS_STEP,
  }),
}

/** Whether a target is out of reach: above the ceiling, or at it where a figure at the ceiling is itself at the top of the tables (a ride's). */
const FLAGGED_AT_CEILING: Record<Sport, boolean> = { run: false, ride: true }

/** The sport's threshold in its own unit: m/s for a run, watts at today's mass for a ride. */
const THRESHOLD_NATIVE: Record<Sport, (wkg: number, massKg: number) => number> = {
  run: (wkg) => metabolicToFlatSpeed(wkg),
  ride: (wkg, massKg) => metabolicToRidePower(wkg, massKg, PRIORS.grossEfficiency.mean),
}

/** Whether the named centre is strictly beyond the figure shown for the threshold: a faster whole second, or more whole watts. */
const BEYOND_SHOWN: Record<Sport, (target: number, now: number, units: UnitSystem) => boolean> = {
  run: (target, now, units) =>
    Math.round(paceSeconds(target, units)) < Math.round(paceSeconds(now, units)),
  ride: (target, now) => Math.round(target) > Math.round(now),
}

/**
 * The figure the lower sport's threshold needs to grade level with the higher sport's whole-percent grade (both graded as an
 * hour), or null when it is above 100% or at the ceiling of what a runner of this age and sex has run, when it cannot be found, or
 * when the named figure is not strictly beyond the one the page shows.
 */
export function matchFigure(input: {
  higher: Sport
  lower: Sport
  /** The higher sport's centre grade, exact. */
  higherGrade: number
  athlete: Athlete
  threshold: ThresholdEstimate | null
  units: UnitSystem
}): MatchFigure | null {
  const { higher, lower, higherGrade, athlete, threshold, units } = input
  const whole = wholePercent(higherGrade)
  const target = whole / 100
  const ceiling = gradeCeiling(HOUR_S, athlete.age, athlete.sex)
  const beyond = FLAGGED_AT_CEILING[lower] ? target >= (ceiling ?? 1) : target > (ceiling ?? 1)
  if (target > 1 || (ceiling !== null && beyond) || threshold === null) return null
  const speed = runSpeedAtGrade(INVERSE_GRADE[lower](higherGrade, target), athlete)
  if (speed === null) return null
  const named = NAMED[lower](NATIVE_AT_GRADE[lower](speed, athlete), units, whole, athlete)
  const now = THRESHOLD_NATIVE[lower](threshold.value, athlete.massKg)
  if (!Number.isFinite(now) || !BEYOND_SHOWN[lower](named.centre, now, units)) return null
  return { higher, lower, wholePercent: whole, ...named, now }
}
