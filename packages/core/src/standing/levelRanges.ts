import { equivalentRunSpeed, ridePowerForRunSpeed } from '../digest/rideAnchor'
import {
  ageAndSexAt,
  ageGrade,
  ageGradeForEffort,
  ageStandardSeconds,
  gradeCeiling,
  levelBands,
} from '../grade'
import type { AgeProfile, LevelBand } from '../grade'
import { HOUR_S } from '../threshold/constants'
import { runSpeedAtGrade } from './match'

/*
 * What each level asks of the athlete, in the sport's own headline figure: the inverse of the grade each sport's corner uses, at
 * the athlete's age on the day asked and, for a ride, their body mass. The figures are whole (a second, a watt) and rounded toward
 * earning the level, so the grade of an entry figure is never under its level's floor.
 */

/**
 * When a table's age is taken: an instant (the age on its day), or the age a grade was taken at, so the table and the grade it
 * marks are read at one age across a birthday.
 */
export type LevelAge = number | { age: number }

function whoAt(profile: AgeProfile, at: LevelAge) {
  return typeof at === 'number' ? ageAndSexAt(profile, at) : { age: at.age, sex: profile.sex }
}

/** The seconds that grade at `floor` or better over `distanceM`, whole, or null when the distance has no standard. */
function entrySeconds(distanceM: number, age: number, sex: AgeProfile['sex'], floor: number) {
  const standard = ageStandardSeconds(distanceM, age, sex)
  if (standard === null) return null
  let seconds = Math.floor(standard / floor)
  // The division can land a hair under the floor in floating point: a second faster is then the entry.
  while (seconds > 1 && (ageGrade(distanceM, seconds, age, sex) ?? 0) < floor) seconds -= 1
  return seconds
}

/**
 * The time at each level for a road race of `distanceM` (the half marathon on the Run page), by the athlete's age (`at`) and
 * their sex: the age-graded finish time that earns it, the same grade the road standards give a race. Null without a graded age or
 * without a standard for the distance. A time is better the lower it is.
 */
export function runLevelTimes(
  profile: AgeProfile,
  at: LevelAge,
  distanceM: number,
): LevelBand[] | null {
  const who = whoAt(profile, at)
  if (who === null) return null
  return levelBands((floor) => entrySeconds(distanceM, who.age, who.sex, floor), 1, false)
}

/**
 * The hour power at each level at the athlete's body mass: the watts whose running equivalent (the one the ride threshold is graded
 * through) grades at the level's floor over an hour, the ride threshold's own inverse (`runSpeedAtGrade`, `ridePowerForRunSpeed`).
 * A level whose floor is at or above the ceiling of what a runner of this age and sex has run is left out, as the ride's own grade
 * cannot reach it. A ride has no age standard of its own, so the table is the running table's, as the grade is. Null without a
 * graded age or when no level above the lowest can be reached.
 */
export function rideLevelPowers(
  profile: AgeProfile,
  at: LevelAge,
  massKg: number,
): LevelBand[] | null {
  const who = whoAt(profile, at)
  if (who === null || !(massKg > 0)) return null
  const ceiling = gradeCeiling(HOUR_S, who.age, who.sex) ?? 1
  const gradeAtWatts = (watts: number) =>
    ageGradeForEffort(equivalentRunSpeed(watts, massKg, who.sex).p50, HOUR_S, who.age, who.sex) ?? 0
  return levelBands(
    (floor) => {
      if (floor >= ceiling) return null
      const speed = runSpeedAtGrade(floor, { ...who, massKg })
      if (speed === null) return null
      let watts = Math.ceil(ridePowerForRunSpeed(speed, massKg, who.sex).centre)
      while (gradeAtWatts(watts) < floor) watts += 1
      return watts
    },
    1,
    true,
  )
}
