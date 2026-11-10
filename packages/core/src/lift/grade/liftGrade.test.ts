import { describe, expect, it } from 'vitest'
import type { LiftEstimate } from '../estimate'
import { gradedLiftOf, liftAgeOn, liftStandard } from './liftStandard'
import { liftCornerGrade, liftGrade } from './liftGrade'
import type { GradedEstimate } from './liftGrade'
import { LIFTS, LIFT_GRADE_STANDARD, MASS_RANGE_KG } from './standard'

const MAN = { birthYear: 1994, sex: 'male' } as const
const WOMAN = { birthYear: 1994, sex: 'female' } as const
/** Mid-year, so the age is 30 for a 1994 birth. */
const DATE = '2024-07-02'
const AGE = liftAgeOn(1994, DATE)

function est(point: number, over: Partial<LiftEstimate> = {}): LiftEstimate {
  return {
    date: DATE,
    point,
    point0: point,
    low: point * 0.9,
    high: point * 1.1,
    floor: { loadKg: point * 0.9, reps: 3, date: DATE },
    sessions: 5,
    sd: 0.05,
    terms: { curve: 0, centre: 0, equations: 0, effort: 0 },
    ind: 0.03,
    meanR: 5,
    ...over,
  }
}
const of = (lift: GradedEstimate['lift'], point: number): GradedEstimate => ({
  lift,
  estimate: est(point),
})

describe('which lift', () => {
  it('maps the barbell competition lifts and nothing else', () => {
    expect(gradedLiftOf('back-squat', 'barbell')).toBe('squat')
    expect(gradedLiftOf('bench-press', 'barbell')).toBe('bench')
    expect(gradedLiftOf('deadlift', 'barbell')).toBe('deadlift')
    expect(gradedLiftOf('sumo-deadlift', 'barbell')).toBe('deadlift')
    expect(gradedLiftOf('back-squat', 'smith')).toBeNull()
    expect(gradedLiftOf('bench-press', 'dumbbell')).toBeNull()
    expect(gradedLiftOf('front-squat', 'barbell')).toBeNull()
    expect(gradedLiftOf('toString', 'barbell')).toBeNull()
  })
})

describe('age', () => {
  it('is the year gap less a half plus the share of the year gone', () => {
    expect(liftAgeOn(1994, '2024-01-01')).toBeCloseTo(29.5 + 0.5 / 365, 6)
    expect(liftAgeOn(1994, '2024-07-02')).toBeCloseTo(30, 2)
    expect(liftAgeOn(1994, '2024-12-31')).toBeCloseTo(30 + 365.5 / 365 - 0.5, 6)
  })
})

describe('liftStandard', () => {
  it('gives the worked example standard for a man of 29.5 at 80 kg', () => {
    const s = liftStandard('squat', 'male', 29.5, 80)
    expect(s.kg).toBeCloseTo(339.3, 0)
    expect(s.outOfRange).toBe(false)
  })

  it('holds age and mass at the fitted edge and says so', () => {
    const [, top] = MASS_RANGE_KG.male
    const edge = liftStandard('bench', 'male', 30, top)
    const over = liftStandard('bench', 'male', 30, top + 20)
    expect(over.kg).toBe(edge.kg)
    expect(over.outOfRange).toBe(true)
    expect(liftStandard('squat', 'male', 90, 80).outOfRange).toBe(true)
    expect(liftStandard('squat', 'female', 12, 65).outOfRange).toBe(true)
  })

  it('never falls as mass rises, for every lift and sex', () => {
    for (const lift of LIFTS) {
      for (const sex of ['male', 'female'] as const) {
        const [lo, hi] = MASS_RANGE_KG[sex]
        let last = 0
        for (let m = lo; m <= hi; m += 1) {
          const kg = liftStandard(lift, sex, 30, m).kg
          expect(kg).toBeGreaterThanOrEqual(last - 1e-9)
          last = kg
        }
      }
    }
  })

  it('rises through the juniors and declines for masters', () => {
    const at = (age: number) => liftStandard('squat', 'male', age, 80).kg
    expect(at(16)).toBeLessThan(at(20))
    expect(at(20)).toBeLessThan(at(30))
    expect(at(60)).toBeLessThan(at(40))
  })

  it('names its data', () => {
    expect(LIFT_GRADE_STANDARD).toBe(1)
  })
})

describe('liftGrade', () => {
  it('grades the worked example: a man of 30, 80 kg, one session of 100 kg for 5 at RPE 8', () => {
    const e = est(122.3, {
      date: '2024-01-15',
      sd: 0.0824,
      floor: { loadKg: 100, reps: 5, date: '2024-01-15' },
    })
    const g = liftGrade({ lift: 'squat', estimate: e }, MAN, { massKg: 80 })
    if (g.kind !== 'graded') throw new Error('expected a grade')
    expect(g.grade.centre.grade).toBeCloseTo(0.36, 2)
    expect(g.grade.centre.level).toBe('Active')
    expect(g.top).toBe(false)
    expect(g.age).toBeCloseTo(29.5, 1)
    expect(g.grade.range!.low.grade).toBeCloseTo(0.331, 2)
    expect(g.grade.range!.high.grade).toBeCloseTo(0.445, 2)
  })

  it('never puts the low under the floor share', () => {
    const wide = est(140, { sd: 0.4, floor: { loadKg: 135, reps: 1, date: DATE } })
    const g = liftGrade({ lift: 'squat', estimate: wide }, MAN, { massKg: 80 })
    if (g.kind !== 'graded') throw new Error('expected a grade')
    const s = liftStandard('squat', 'male', AGE, 80).kg
    expect(g.grade.range!.low.grade).toBeGreaterThanOrEqual(
      (135 / s) * Math.exp(-1.645 * 0.05) - 1e-9,
    )
  })

  it('widens a deadlift top over the same squat spread', () => {
    const dl = liftGrade(of('deadlift', 150), MAN, { massKg: 80 })
    const sq = liftGrade(of('squat', 150), MAN, { massKg: 80 })
    if (dl.kind !== 'graded' || sq.kind !== 'graded') throw new Error('expected grades')
    const up = (g: typeof dl, s: number) => g.grade.range!.high.grade / g.grade.centre.grade / s
    expect(up(dl, 1)).toBeGreaterThan(up(sq, 1))
    expect(up(dl, 1) / up(sq, 1)).toBeGreaterThan(1.03)
  })

  it('holds a centre at or above 100% at the top of the scale', () => {
    const s = liftStandard('squat', 'male', AGE, 80).kg
    const g = liftGrade(of('squat', s * 1.05), MAN, { massKg: 80 })
    if (g.kind !== 'graded') throw new Error('expected a grade')
    expect(g.top).toBe(true)
    expect(g.grade.centre.grade).toBe(1)
    expect(g.grade.range!.high.grade).toBe(1)
  })

  it('gives no grade above 110%', () => {
    const s = liftStandard('squat', 'male', AGE, 80).kg
    expect(liftGrade(of('squat', s * 1.11), MAN, { massKg: 80 })).toEqual({
      kind: 'gap',
      why: 'out-of-range',
    })
    expect(liftGrade(of('squat', s * 1.09), MAN, { massKg: 80 }).kind).toBe('graded')
  })

  it('says why there is no grade', () => {
    expect(liftGrade(of('squat', 140), null, { massKg: 80 })).toEqual({
      kind: 'gap',
      why: 'no-profile',
    })
    expect(liftGrade(of('squat', 140), MAN, { massKg: 0 })).toEqual({ kind: 'gap', why: 'no-mass' })
    expect(liftGrade(of('squat', 140), MAN, { massKg: NaN })).toEqual({
      kind: 'gap',
      why: 'no-mass',
    })
    expect(liftGrade(null, MAN, { massKg: 80 })).toEqual({ kind: 'gap', why: 'no-graded-lift' })
    expect(liftGrade(of('squat', 140), MAN, { massKg: 160 })).toEqual({
      kind: 'gap',
      why: 'out-of-range',
    })
    expect(liftGrade(of('squat', 140), { birthYear: 1900, sex: 'male' }, { massKg: 80 })).toEqual({
      kind: 'gap',
      why: 'out-of-range',
    })
    const bad = { lift: 'squat', estimate: est(140, { date: 'not a date' }) } as const
    expect(liftGrade(bad, MAN, { massKg: 80 })).toEqual({ kind: 'gap', why: 'out-of-range' })
  })

  it('grades a woman against her own standard', () => {
    const g = liftGrade(of('squat', 100), WOMAN, { massKg: 65 })
    if (g.kind !== 'graded') throw new Error('expected a grade')
    expect(g.grade.centre.grade).toBeCloseTo(0.438, 2)
  })
})

describe('a placeholder mass', () => {
  it('never grades: a mass the athlete did not enter gives the no-mass gap, per lift and on the corner', () => {
    const assumed = { massKg: 80, massAssumed: true as const }
    expect(liftGrade(of('squat', 140), MAN, assumed)).toEqual({ kind: 'gap', why: 'no-mass' })
    expect(liftCornerGrade([of('squat', 140)], MAN, assumed)).toEqual({
      kind: 'gap',
      why: 'no-mass',
    })
  })
})

describe('liftCornerGrade', () => {
  it('is the share of the total over the graded lifts, and names them', () => {
    const squat = liftGrade(of('squat', 140), MAN, { massKg: 80 })
    const c = liftCornerGrade([of('squat', 140), of('bench', 100)], MAN, { massKg: 80 })
    if (c.kind !== 'graded' || squat.kind !== 'graded') throw new Error('expected grades')
    const s = liftStandard('squat', 'male', AGE, 80).kg + liftStandard('bench', 'male', AGE, 80).kg
    expect(c.grade.centre.grade).toBeCloseTo(240 / s, 6)
    expect(c.lifts).toEqual(['squat', 'bench'])
    const bench = liftGrade(of('bench', 100), MAN, { massKg: 80 })
    if (bench.kind !== 'graded') throw new Error('expected a grade')
    const sb = liftStandard('bench', 'male', AGE, 80).kg
    const ss = liftStandard('squat', 'male', AGE, 80).kg
    const lows = squat.grade.range!.low.grade * ss + bench.grade.range!.low.grade * sb
    const highs = squat.grade.range!.high.grade * ss + bench.grade.range!.high.grade * sb
    expect(c.grade.range!.low.grade).toBeCloseTo(lows / s, 6)
    expect(c.grade.range!.high.grade).toBeCloseTo(highs / s, 6)
    expect(c.grade.range!.low.grade).toBeLessThan(c.grade.centre.grade)
    expect(c.grade.range!.high.grade).toBeGreaterThan(c.grade.centre.grade)
  })

  it('counts a lift once, at its heaviest estimate, as the Big three row does (a sumo and a conventional deadlift)', () => {
    const one = liftCornerGrade([of('squat', 140), of('deadlift', 180)], MAN, { massKg: 80 })
    const both = liftCornerGrade(
      [of('squat', 140), of('deadlift', 160), of('deadlift', 180)],
      MAN,
      { massKg: 80 },
    )
    if (one.kind !== 'graded' || both.kind !== 'graded') throw new Error('expected grades')
    expect(both.grade).toEqual(one.grade)
    expect(both.lifts).toEqual(['squat', 'deadlift'])
  })

  it('takes the age at the newest estimate', () => {
    const later = '2026-07-02'
    const c = liftCornerGrade(
      [of('squat', 140), { lift: 'bench', estimate: est(100, { date: later }) }],
      MAN,
      { massKg: 80 },
    )
    if (c.kind !== 'graded') throw new Error('expected a grade')
    expect(c.age).toBe(liftAgeOn(1994, later))
  })

  it('with one lift is that lift', () => {
    const one = liftGrade(of('squat', 140), MAN, { massKg: 80 })
    const c = liftCornerGrade([of('squat', 140)], MAN, { massKg: 80 })
    if (c.kind !== 'graded' || one.kind !== 'graded') throw new Error('expected grades')
    expect(c.grade).toEqual(one.grade)
  })

  it('leaves out a lift beyond the ceiling and keeps the rest', () => {
    const c = liftCornerGrade([of('squat', 140), of('bench', 900)], MAN, { massKg: 80 })
    if (c.kind !== 'graded') throw new Error('expected a grade')
    expect(c.lifts).toEqual(['squat'])
  })

  it('flags the top when the total reaches the standard', () => {
    const s = liftStandard('squat', 'male', AGE, 80).kg
    const c = liftCornerGrade([of('squat', s * 1.02)], MAN, { massKg: 80 })
    if (c.kind !== 'graded') throw new Error('expected a grade')
    expect(c.top).toBe(true)
    expect(c.grade.centre.grade).toBe(1)
  })

  it('gaps with the reason', () => {
    expect(liftCornerGrade([of('squat', 140)], null, { massKg: 80 })).toEqual({
      kind: 'gap',
      why: 'no-profile',
    })
    expect(liftCornerGrade([of('squat', 140)], MAN, { massKg: 0 })).toEqual({
      kind: 'gap',
      why: 'no-mass',
    })
    expect(liftCornerGrade([], MAN, { massKg: 80 })).toEqual({ kind: 'gap', why: 'no-graded-lift' })
    expect(liftCornerGrade([of('squat', 140)], MAN, { massKg: 160 })).toEqual({
      kind: 'gap',
      why: 'out-of-range',
    })
  })
})
