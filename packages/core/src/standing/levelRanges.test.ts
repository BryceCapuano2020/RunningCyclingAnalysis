import { describe, expect, it } from 'vitest'
import { HALF_MARATHON_M } from '../constants'
import { equivalentRunSpeed } from '../digest/rideAnchor'
import { GRADE_LEVELS, ageGrade, ageGradeForEffort, levelOf } from '../grade'
import type { LevelBand } from '../grade'
import { HOUR_S } from '../threshold/constants'
import { rideLevelPowers, runLevelTimes } from './levelRanges'

/** Mid-year, so a 1990 birth is 34 in the calendar sense the grade uses. */
const AT = Date.UTC(2024, 6, 2, 12)
const WOMAN = { birthYear: 1990, sex: 'female' } as const
const MAN = { birthYear: 1975, sex: 'male' } as const
const AGE = { woman: 34, man: 49 }

const labels = GRADE_LEVELS.map((level) => level.label)

describe('runLevelTimes', () => {
  it.each([
    ['woman', WOMAN, AGE.woman],
    ['man', MAN, AGE.man],
  ] as const)('earns each level exactly at its worst time (%s)', (_name, profile, age) => {
    const bands = runLevelTimes(profile, AT, HALF_MARATHON_M) as LevelBand[]
    expect(bands.map((band) => band.label)).toEqual(labels)
    for (const band of bands) {
      const level = GRADE_LEVELS.find((each) => each.label === band.label)!
      const grade = (seconds: number) => ageGrade(HALF_MARATHON_M, seconds, age, profile.sex)!
      if (band.worst !== null) {
        expect(grade(band.worst)).toBeGreaterThanOrEqual(level.min)
        expect(levelOf(grade(band.worst))).toBe(band.label)
        // A second slower falls to the level below.
        expect(grade(band.worst + 1)).toBeLessThan(level.min)
      }
      if (band.best !== null) {
        expect(levelOf(grade(band.best))).toBe(band.label)
        // A second faster is the level above.
        expect(levelOf(grade(band.best - 1))).not.toBe(band.label)
      }
    }
  })

  it('is open at the top (no best) and at the bottom (no worst), and the bands do not overlap', () => {
    const bands = runLevelTimes(WOMAN, AT, HALF_MARATHON_M) as LevelBand[]
    expect(bands[0]!.best).toBeNull()
    expect(bands[bands.length - 1]!.worst).toBeNull()
    for (let i = 1; i < bands.length; i++) {
      // A lower level starts a second after the one above it ends, and times rise down the ladder.
      expect(bands[i]!.best).toBe(bands[i - 1]!.worst! + 1)
    }
  })

  it('has no table without an age the standards cover or a distance they grade', () => {
    expect(runLevelTimes({ birthYear: 2024, sex: 'male' }, AT, HALF_MARATHON_M)).toBeNull()
    expect(runLevelTimes(WOMAN, AT, 100)).toBeNull()
  })
})

describe('rideLevelPowers', () => {
  it.each([
    ['woman at 60 kg', WOMAN, AGE.woman, 60],
    ['man at 82 kg', MAN, AGE.man, 82],
  ] as const)('earns each level at its worst power (%s)', (_name, profile, age, massKg) => {
    const bands = rideLevelPowers(profile, AT, massKg) as LevelBand[]
    const gradeAt = (watts: number) =>
      ageGradeForEffort(
        equivalentRunSpeed(watts, massKg, profile.sex).p50,
        HOUR_S,
        age,
        profile.sex,
      )!
    for (const band of bands) {
      const level = GRADE_LEVELS.find((each) => each.label === band.label)!
      if (band.worst !== null) {
        expect(gradeAt(band.worst)).toBeGreaterThanOrEqual(level.min)
        expect(gradeAt(band.worst - 1)).toBeLessThan(level.min)
      }
      if (band.best !== null) expect(levelOf(gradeAt(band.best))).toBe(band.label)
    }
    // Watts rise up the ladder.
    const worst = bands.flatMap((band) => (band.worst === null ? [] : [band.worst]))
    expect([...worst].sort((a, b) => b - a)).toEqual(worst)
  })

  it('asks for more power of a heavier athlete at every level', () => {
    const light = rideLevelPowers(MAN, AT, 65) as LevelBand[]
    const heavy = rideLevelPowers(MAN, AT, 90) as LevelBand[]
    heavy.forEach((band, index) => {
      if (band.worst !== null) expect(band.worst).toBeGreaterThan(light[index]!.worst!)
    })
  })

  it('has no table without a mass or a graded age', () => {
    expect(rideLevelPowers(MAN, AT, 0)).toBeNull()
    expect(rideLevelPowers({ birthYear: 2024, sex: 'male' }, AT, 70)).toBeNull()
  })
})
