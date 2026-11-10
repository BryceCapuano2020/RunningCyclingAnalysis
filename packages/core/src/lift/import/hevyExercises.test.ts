import { describe, expect, it } from 'vitest'
import { mapHevyExercise } from './hevyExercises'

describe('mapHevyExercise', () => {
  it.each([
    ['Bench Press (Barbell)', 'bench-press', 'barbell', false],
    ['Squat (Dumbbell)', 'back-squat', 'dumbbell', false],
    ['Squat (Smith Machine)', 'back-squat', 'smith', false],
    ['Seated Row (Cable)', 'cable-row', 'cable', false],
    ['Bench Press (Resistance Band)', 'bench-press', 'other', false],
    ['Bent Over Row (Dumbbell)', 'dumbbell-row', 'dumbbell', false],
    ['Pull-Up', 'pull-up', 'bodyweight', false],
    ['Pull Up (Assisted)', 'assisted-pull-up', 'other', true],
    ['Zottman Curl', 'zottman-curl', 'other', true],
    ['Pendlay Row (Barbell)', 'pendlay-row', 'barbell', true],
  ])('%s', (title, exercise, equipment, custom) => {
    expect(mapHevyExercise(title)).toEqual({ exercise, equipment, custom })
  })

  it('is null for a title with nothing to name it', () => {
    expect(mapHevyExercise('(Barbell)')).toBeNull()
    expect(mapHevyExercise('')).toBeNull()
  })
})
