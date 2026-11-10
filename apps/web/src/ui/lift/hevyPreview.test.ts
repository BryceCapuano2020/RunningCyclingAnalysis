import { liftSetKey } from '@rca/core/lift'
import { describe, expect, it } from 'vitest'
import { HEVY_HEADER, hevyRow } from './hevyFixture'
import { fileProblem, previewHevy } from './hevyPreview'

const D1 = '2031-03-02 07:30:00'
const D2 = '2031-03-04 07:30:00'
const SQ = 'Squat (Barbell)'
const file = (...rows: string[]) => [HEVY_HEADER, ...rows].join('\n')

describe('previewHevy', () => {
  const text = file(
    hevyRow(D1, SQ, 0, 'warmup', '40', '8'),
    hevyRow(D1, SQ, 1, 'normal', '100', '5', '8'),
    hevyRow(D1, SQ, 2, 'failure', '100', '4'),
    hevyRow(D2, 'Zottman Curl', 0, 'normal', '10', '10'),
    hevyRow(D2, 'Bench Press (Barbell)', 0, 'normal', 'abc', '5'),
  )

  it('counts sets, days, lifts, custom names and skipped rows', () => {
    const result = previewHevy(text, [], 'metric')
    if ('refused' in result) throw new Error(result.refused)
    const { preview } = result
    expect(preview.sets).toHaveLength(4)
    expect(preview.days).toBe(2)
    expect(preview.catalogLifts).toBe(1)
    expect(preview.customLifts).toEqual(['zottman-curl'])
    expect(preview.replaced).toBe(0)
    expect(preview.skipped).toEqual([{ row: 6, reason: 'The weight is not a number.' }])
  })

  it('maps warm-up and failure sets and renumbers the set order', () => {
    const result = previewHevy(text, [], 'metric')
    if ('refused' in result) throw new Error(result.refused)
    const squats = result.preview.sets.filter((set) => set.exercise === 'back-squat')
    expect(squats.map((set) => [set.setOrder, set.warmup ?? false, set.rpe])).toEqual([
      [1, true, undefined],
      [2, false, 8],
      [3, false, 10],
    ])
  })

  it('counts the sets that replace a stored key', () => {
    const first = previewHevy(text, [], 'metric')
    if ('refused' in first) throw new Error(first.refused)
    const held = first.preview.sets.slice(0, 2)
    const again = previewHevy(text, held, 'metric')
    if ('refused' in again) throw new Error(again.refused)
    expect(again.preview.replaced).toBe(2)
    expect(held.map(liftSetKey)).toHaveLength(2)
  })

  it('reads a bare weight column in the athlete units, to 0.01 kg', () => {
    const bare =
      'title,start_time,exercise_title,set_index,weight,reps\nDay,' + D1 + ',' + SQ + ',0,100,5'
    const result = previewHevy(bare, [], 'imperial')
    if ('refused' in result) throw new Error(result.refused)
    expect(result.preview.sets[0]?.loadKg).toBe(45.36)
  })

  it('refuses a header it does not know, naming the columns', () => {
    expect(previewHevy('a,b,c\n1,2,3', [], 'metric')).toEqual({
      refused: expect.stringMatching(
        /^This file is not a Hevy workouts export we can read: missing columns/,
      ),
    })
  })
})

describe('fileProblem', () => {
  it('says why a file is not read', () => {
    expect(fileProblem({ name: 'x.txt', size: 10 })).toMatch(/\.csv/)
    expect(fileProblem({ name: 'x.csv', size: 0 })).toBe('That file is empty.')
    expect(fileProblem({ name: 'x.csv', size: 40 * 1024 * 1024 })).toMatch(/too large/)
    expect(fileProblem({ name: 'X.CSV', size: 10 })).toBeNull()
  })
})
