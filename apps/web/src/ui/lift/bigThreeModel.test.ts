import { describe, expect, it } from 'vitest'
import { bigThreeTotal, buildLiftState, liftGrade } from '@rca/core/lift'
import { squat } from './liftFixtures'
import { bigThreeLeadOf } from './bigThreeModel'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const
const bench = (date: string, kg: number) =>
  squat(date, kg, { exercise: 'bench-press', equipment: 'barbell' })
const deadlift = (date: string, kg: number) =>
  squat(date, kg, { exercise: 'deadlift', equipment: 'barbell' })
const lead = (
  sets: Parameters<typeof buildLiftState>[0],
  profile = PROFILE as typeof PROFILE | null,
) => bigThreeLeadOf(buildLiftState(sets, SETTINGS).lifts, profile, SETTINGS, 'metric')

describe('bigThreeLeadOf', () => {
  it('is null while none of the big three has an estimate, so the page leads with the lift trained last', () => {
    expect(lead([squat('2031-01-02', 20, { exercise: 'curl', equipment: 'cable' })])).toBeNull()
    expect(lead([])).toBeNull()
  })

  it('gives the three in squat, bench, deadlift order, with core’s total and grades', () => {
    const sets = [squat('2031-01-02', 120), bench('2031-01-03', 90), deadlift('2031-01-04', 160)]
    const got = lead(sets)!
    expect(got.lifts.map((lift) => lift.label)).toEqual(['Squat', 'Bench', 'Deadlift'])
    const summaries = buildLiftState(sets, SETTINGS).lifts
    const big = bigThreeTotal(
      summaries.map((s) => ({
        lift:
          s.exercise === 'back-squat'
            ? 'squat'
            : s.exercise === 'bench-press'
              ? 'bench'
              : 'deadlift',
        estimate: s.estimate!,
      })),
    )
    expect(big.kind).toBe('total')
    expect(got.total).toEqual({
      number: String(Math.round(big.kind === 'total' ? big.kg : 0)),
      unit: 'kg',
    })
    const squatPart = big.parts.find((part) => part.lift === 'squat')!
    expect(got.lifts[0]!.grade).toEqual(
      liftGrade({ lift: 'squat', estimate: squatPart.estimate }, PROFILE, SETTINGS),
    )
  })

  it('leaves a lift not logged yet empty, and gives no total until all three have one', () => {
    const got = lead([squat('2031-01-02', 120)])!
    expect(got.total).toBeNull()
    expect(got.lifts.map((lift) => lift.max === null)).toEqual([false, true, true])
    expect(got.lifts[1]!.grade).toBeNull()
  })

  it('says what a grade needs when the profile is missing', () => {
    const got = lead([squat('2031-01-02', 120)], null)!
    expect(got.lifts[0]!.grade).toMatchObject({ kind: 'gap', why: 'no-profile' })
  })
})
