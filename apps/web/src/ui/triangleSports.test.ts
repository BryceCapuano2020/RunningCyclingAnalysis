import { describe, expect, it } from 'vitest'
import type { LiftCornerGrade } from '@rca/core/lift'
import type { GradeOutcome } from './grades'
import { coveredText, triangleViewOf } from './triangleSports'

const sportGrade = (centre: number) => ({
  centre: { grade: centre, level: 'Local' },
  range: {
    low: { grade: centre - 0.05, level: 'Local' },
    high: { grade: centre + 0.05, level: 'Local' },
  },
})
const run = { kind: 'graded', grade: sportGrade(0.61) } as unknown as GradeOutcome

describe('triangleViewOf', () => {
  it('draws lifting from its share-of-total grade when there is one', () => {
    const lift: LiftCornerGrade = {
      kind: 'graded',
      age: 30,
      grade: sportGrade(0.42),
      top: false,
      lifts: ['squat', 'deadlift'],
    }
    const view = triangleViewOf({ run, ride: null }, lift)
    expect(view.grades.lift).toEqual({ kind: 'graded', grade: sportGrade(0.42) })
    expect(view.grades.ride).toEqual({ kind: 'gap' })
  })

  it('leaves lifting a gap without a grade, or with a gap of its own', () => {
    expect(triangleViewOf({ run, ride: null }).grades.lift).toEqual({ kind: 'gap' })
    const none: LiftCornerGrade = { kind: 'gap', why: 'no-graded-lift' }
    expect(triangleViewOf({ run, ride: null }, none).grades.lift).toEqual({ kind: 'gap' })
  })
})

describe('which lifts a lifting corner holds', () => {
  it('names them when the corner holds fewer than three, and says nothing with all three', () => {
    expect(coveredText(['squat', 'bench'])).toBe('Squat and bench')
    expect(coveredText(['deadlift'])).toBe('Deadlift only')
    const two: LiftCornerGrade = {
      kind: 'graded',
      age: 30,
      grade: sportGrade(0.42),
      top: false,
      lifts: ['squat', 'bench'],
    }
    expect(triangleViewOf({ run, ride: null }, two).notes.lift).toBe('Squat and bench')
    const three: LiftCornerGrade = { ...two, lifts: ['squat', 'bench', 'deadlift'] }
    expect(triangleViewOf({ run, ride: null }, three).notes.lift).toBeUndefined()
  })
})
