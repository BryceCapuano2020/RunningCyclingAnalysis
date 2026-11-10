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
    ['Seated Overhead Press (Dumbbell)', 'seated-dumbbell-shoulder-press', 'dumbbell', false],
    ['Seated Overhead Press (Barbell)', 'overhead-press', 'barbell', false],
    ['Butterfly (Pec Deck)', 'pec-deck-fly', 'machine', false],
    ['Triceps Rope Pushdown (Cable)', 'triceps-pressdown', 'cable', false],
    ['Standing Calf Raise (Machine)', 'standing-calf-raise', 'machine', false],
    ['Face Pull (Cable)', 'face-pull', 'cable', false],
    ['Hanging Leg Raise', 'hanging-leg-raise', 'bodyweight', false],
    ['Assisted Dip', 'custom-assisted-dip', 'other', true],
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
