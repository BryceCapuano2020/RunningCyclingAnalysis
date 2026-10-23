import { describe, expect, it } from 'vitest'
import { METRES_PER_MILE } from '../units/convert'
import {
  FIRST_GRADED_AGE,
  GRADE_LEVELS,
  LAST_GRADED_AGE,
  ROAD_STANDARDS_SOURCE,
  ageAt,
  ageGrade,
  ageGradeForEffort,
  ageStandardSeconds,
  gradePercent,
  levelOf,
  type Sex,
} from './ageGrade'

describe('ageStandardSeconds', () => {
  it('returns the published seconds at table distances', () => {
    expect(ageStandardSeconds(5000, 40, 'male')).toBe(812)
    expect(ageStandardSeconds(METRES_PER_MILE, 40, 'male')).toBe(244)
    expect(ageStandardSeconds(42195, 70, 'male')).toBe(9880)
  })

  it('interpolates log-linearly between table distances', () => {
    const geometricMid = Math.sqrt(5000 * 6000)
    expect(ageStandardSeconds(geometricMid, 40, 'male')).toBeCloseTo(Math.sqrt(812 * 977), 6)
  })

  it('keeps an interpolated time between its neighbouring standards', () => {
    for (const d of [5100, 5500, 5900]) {
      const s = ageStandardSeconds(d, 40, 'male')!
      expect(s).toBeGreaterThan(812)
      expect(s).toBeLessThan(977)
    }
  })

  it('is non-decreasing in distance for a sample of ages', () => {
    // Male age 5 is left out: its 7 Mile and 12 km cells are inverted in the source.
    const ages: { sex: Sex; age: number }[] = [
      { sex: 'male', age: 6 },
      { sex: 'male', age: 40 },
      { sex: 'male', age: 100 },
      { sex: 'female', age: 5 },
      { sex: 'female', age: 20 },
      { sex: 'female', age: 70 },
    ]
    const steps = 300
    for (const { sex, age } of ages) {
      let previous = 0
      for (let k = 0; k <= steps; k++) {
        const d = METRES_PER_MILE * Math.pow(200000 / METRES_PER_MILE, k / steps)
        const s = ageStandardSeconds(d, age, sex)!
        expect(s).toBeGreaterThanOrEqual(previous)
        previous = s
      }
    }
  })

  it('returns null outside the age range', () => {
    expect(ageStandardSeconds(5000, 4, 'male')).toBeNull()
    expect(ageStandardSeconds(5000, 101, 'female')).toBeNull()
    expect(ageStandardSeconds(5000, 40.5, 'male')).toBeNull()
    expect(ageStandardSeconds(5000, Number.NaN, 'male')).toBeNull()
    expect(ageStandardSeconds(5000, 5, 'male')).not.toBeNull()
    expect(ageStandardSeconds(5000, 100, 'female')).not.toBeNull()
  })

  it('returns null outside the distance range', () => {
    expect(ageStandardSeconds(1000, 40, 'male')).toBeNull()
    expect(ageStandardSeconds(200001, 40, 'male')).toBeNull()
  })

  it('returns null for a non-finite distance', () => {
    expect(ageStandardSeconds(Number.NaN, 40, 'male')).toBeNull()
    expect(ageStandardSeconds(Number.POSITIVE_INFINITY, 40, 'male')).toBeNull()
    expect(ageStandardSeconds(Number.NEGATIVE_INFINITY, 40, 'male')).toBeNull()
  })

  it('returns null for a sex that is not in the tables, including inherited keys', () => {
    expect(ageStandardSeconds(5000, 40, 'other' as Sex)).toBeNull()
    expect(ageStandardSeconds(5000, 40, 'toString' as Sex)).toBeNull()
  })

  it('keeps the female age-100 10 km cell as published', () => {
    // Source anomaly: 12172 s, where the 10 km factor would give 11686 s (roadStandards.ts).
    expect(ageStandardSeconds(10000, 100, 'female')).toBe(12172)
  })
})

describe('one year of age', () => {
  it('changes the female 100 km standard from 69 to 70 by 1.62%', () => {
    const at69 = ageStandardSeconds(100000, 69, 'female')!
    const at70 = ageStandardSeconds(100000, 70, 'female')!
    expect(at70 / at69 - 1).toBeCloseTo(0.0162, 4)
  })

  it('inflates an adult grade when the age is overstated', () => {
    expect(ageGrade(100000, 40000, 70, 'female')!).toBeGreaterThan(
      ageGrade(100000, 40000, 69, 'female')!,
    )
  })

  it('deflates a grade when the age is overstated where the standard falls with age', () => {
    // Male 5 km standard falls from 1265 s at age 5 to 1154 s at age 6.
    expect(ageGrade(5000, 1200, 6, 'male')!).toBeLessThan(ageGrade(5000, 1200, 5, 'male')!)
  })
})

describe('ageGrade', () => {
  // Reference grades from the USATF 2025 workbooks: standard seconds and grade fraction.
  const reference = [
    {
      name: 'male 40, 5 km in 20:00',
      sex: 'male',
      age: 40,
      distanceM: 5000,
      timeS: 1200,
      standardS: 812,
      grade: 0.6767,
    },
    {
      name: 'female 55, 10 km in 50:00',
      sex: 'female',
      age: 55,
      distanceM: 10000,
      timeS: 3000,
      standardS: 2073,
      grade: 0.691,
    },
    {
      name: 'male 30, half marathon in 1:30:00',
      sex: 'male',
      age: 30,
      distanceM: 21097.5,
      timeS: 5400,
      standardS: 3451,
      grade: 0.6391,
    },
    {
      name: 'female 65, 5 km in 30:00',
      sex: 'female',
      age: 65,
      distanceM: 5000,
      timeS: 1800,
      standardS: 1169,
      grade: 0.6494,
    },
    {
      name: 'male 70, marathon in 4:00:00',
      sex: 'male',
      age: 70,
      distanceM: 42195,
      timeS: 14400,
      standardS: 9880,
      grade: 0.6861,
    },
    {
      name: 'female 20, 10 km in 40:00',
      sex: 'female',
      age: 20,
      distanceM: 10000,
      timeS: 2400,
      standardS: 1729,
      grade: 0.7204,
    },
  ] as const

  it.each(reference)('grades $name as $grade', (c) => {
    expect(ageStandardSeconds(c.distanceM, c.age, c.sex)).toBe(c.standardS)
    expect(ageGrade(c.distanceM, c.timeS, c.age, c.sex)).toBeCloseTo(c.grade, 3)
  })

  it('is the standard divided by the time', () => {
    expect(ageGrade(5000, 812 * 2, 40, 'male')).toBeCloseTo(0.5, 12)
  })

  it('is null without a standard', () => {
    expect(ageGrade(5000, 1200, 4, 'male')).toBeNull()
    expect(ageGrade(1000, 300, 40, 'male')).toBeNull()
    expect(ageGrade(5000, 1200, 40, 'other' as Sex)).toBeNull()
  })

  it('is null for a time that is zero, negative, infinite or NaN', () => {
    expect(ageGrade(5000, 0, 40, 'male')).toBeNull()
    expect(ageGrade(5000, -5, 40, 'male')).toBeNull()
    expect(ageGrade(5000, Number.POSITIVE_INFINITY, 40, 'male')).toBeNull()
    expect(ageGrade(5000, Number.NaN, 40, 'male')).toBeNull()
  })

  it('is null when the quotient overflows to infinity', () => {
    expect(ageGrade(5000, Number.MIN_VALUE, 40, 'male')).toBeNull()
  })
})

describe('ageGradeForEffort', () => {
  it('grades speed times duration metres in that duration', () => {
    // 5 m/s for 1200 s is 6000 m, a table distance with male 40 standard 977 s.
    expect(ageGradeForEffort(5, 1200, 40, 'male')).toBeCloseTo(977 / 1200, 12)
    expect(ageGradeForEffort(5, 1200, 40, 'male')).toBe(ageGrade(6000, 1200, 40, 'male'))
  })

  it('is null when the speed gives no distance with a standard', () => {
    expect(ageGradeForEffort(0, 1200, 40, 'male')).toBeNull()
    expect(ageGradeForEffort(-5, 1200, 40, 'male')).toBeNull()
  })

  it('is null for a non-finite speed or duration', () => {
    expect(ageGradeForEffort(Number.NaN, 1200, 40, 'male')).toBeNull()
    expect(ageGradeForEffort(5, Number.POSITIVE_INFINITY, 40, 'male')).toBeNull()
  })

  it('is null when speed times duration overflows', () => {
    expect(ageGradeForEffort(1e300, 1e300, 40, 'male')).toBeNull()
  })
})

describe('levelOf', () => {
  it.each([
    [1.2, 'World'],
    [0.9, 'World'],
    [0.8999, 'National'],
    [0.8, 'National'],
    [0.7999, 'Regional'],
    [0.7, 'Regional'],
    [0.6999, 'Local'],
    [0.6, 'Local'],
    [0.5999, 'Recreational'],
    [0, 'Recreational'],
  ])('labels grade %s as %s', (grade, label) => {
    expect(levelOf(grade)).toBe(label)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.1, -1])(
    'returns null for %s, which is not a finite non-negative grade',
    (grade) => {
      expect(levelOf(grade)).toBeNull()
    },
  )

  it('lists the bands highest first', () => {
    expect(GRADE_LEVELS.map((level) => level.min)).toEqual([0.9, 0.8, 0.7, 0.6, 0])
  })
})

describe('gradePercent', () => {
  it('rounds down to one decimal, so 0.8999 shows 89.9 and not 90', () => {
    expect(gradePercent(0.8999)).toBe(89.9)
    expect(gradePercent(0.9)).toBe(90)
  })

  it.each([
    [0.9, 90, 'World'],
    [0.8999, 89.9, 'National'],
    [0.8, 80, 'National'],
    [0.7999, 79.9, 'Regional'],
    [0.7, 70, 'Regional'],
    [0.6999, 69.9, 'Local'],
    [0.6, 60, 'Local'],
    [0.5999, 59.9, 'Recreational'],
  ])('shows grade %s as %s%%, labelled %s', (grade, percent, label) => {
    expect(gradePercent(grade)).toBe(percent)
    expect(levelOf(grade)).toBe(label)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.1])(
    'returns null for %s, as levelOf does',
    (grade) => {
      expect(gradePercent(grade)).toBeNull()
    },
  )
})

describe('ageAt', () => {
  // Local dates keep these tests independent of the machine's time zone.
  it('is the calendar-year difference, since only the birth year is known', () => {
    expect(ageAt(1985, new Date(2026, 5, 15).getTime())).toBe(41)
    expect(ageAt(1985, new Date(2026, 0, 1).getTime())).toBe(41)
    expect(ageAt(1985, new Date(2025, 11, 31, 23, 59).getTime())).toBe(40)
  })

  it('returns null for a birth year that is not an integer', () => {
    expect(ageAt(Number.NaN, Date.now())).toBeNull()
    expect(ageAt(1985.5, Date.now())).toBeNull()
  })

  it('returns null for a time that is not finite or not a representable date', () => {
    expect(ageAt(1985, Number.NaN)).toBeNull()
    expect(ageAt(1985, Number.POSITIVE_INFINITY)).toBeNull()
    expect(ageAt(1985, 1e300)).toBeNull()
  })

  it('returns null for an age outside 0 to 120, and keeps both ends', () => {
    const june2026 = new Date(2026, 5, 1).getTime()
    expect(ageAt(2026, june2026)).toBe(0)
    expect(ageAt(1906, june2026)).toBe(120)
    expect(ageAt(1905, june2026)).toBeNull()
    expect(ageAt(2027, june2026)).toBeNull()
  })
})

describe('ROAD_STANDARDS_SOURCE', () => {
  it('cites the USATF 2025 standards under CC0 1.0', () => {
    expect(ROAD_STANDARDS_SOURCE).toEqual({
      name: 'USATF road age standards (2025)',
      shortName: 'USATF road standards',
      authors: 'Alan Jones and Tom Bernhard',
      url: 'https://github.com/AlanLyttonJones/Age-Grade-Tables',
      licence: 'CC0 1.0',
    })
  })
})

describe('grade names and ages', () => {
  it('names each band by its bare level name, highest first', () => {
    expect(GRADE_LEVELS.map((band) => band.label)).toEqual([
      'World',
      'National',
      'Regional',
      'Local',
      'Recreational',
    ])
  })

  it('covers ages FIRST_GRADED_AGE to LAST_GRADED_AGE, and no others', () => {
    expect([FIRST_GRADED_AGE, LAST_GRADED_AGE]).toEqual([5, 100])
    expect(ageStandardSeconds(5000, FIRST_GRADED_AGE, 'male')).not.toBeNull()
    expect(ageStandardSeconds(5000, LAST_GRADED_AGE, 'male')).not.toBeNull()
    expect(ageStandardSeconds(5000, FIRST_GRADED_AGE - 1, 'male')).toBeNull()
    expect(ageStandardSeconds(5000, LAST_GRADED_AGE + 1, 'male')).toBeNull()
  })
})
