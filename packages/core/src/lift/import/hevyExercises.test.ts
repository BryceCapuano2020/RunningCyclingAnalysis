import { describe, expect, it } from 'vitest'
import { mapHevyExercise, slugify } from './hevyExercises'

describe('slugify', () => {
  it('lowers, hyphenates and drops accents, and is null with nothing to keep', () => {
    expect(slugify('  Cable  Crossover! ')).toBe('cable-crossover')
    expect(slugify('Écarté (Haltère)')).toBe('ecarte-haltere')
    expect(slugify(' -- ')).toBeNull()
  })
})

describe('mapHevyExercise', () => {
  it.each([
    ['Bench Press (Barbell)', 'bench-press', 'barbell', false],
    ['Squat (Dumbbell)', 'back-squat', 'dumbbell', false],
    ['Squat (Smith Machine)', 'back-squat', 'smith', false],
    ['Leg Press (Machine)', 'leg-press', 'machine', false],
    ['Seated Row (Cable)', 'cable-row', 'cable', false],
    ['Goblet Squat (Kettlebell)', 'goblet-squat', 'kettlebell', false],
    ['Push Up (Bodyweight)', 'push-up', 'bodyweight', false],
    ['Bench Press (Resistance Band)', 'bench-press', 'other', false],
    ['Bent Over Row (Dumbbell)', 'dumbbell-row', 'dumbbell', false],
    ['Bent Over Row (Barbell)', 'barbell-row', 'barbell', false],
    ['Pull-Up', 'pull-up', 'bodyweight', false],
    ['Hip-Thrust (Barbell)', 'hip-thrust', 'barbell', false],
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
