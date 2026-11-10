import { describe, expect, it } from 'vitest'
import { LIFT_EXERCISE_PATTERN } from '@rca/core/lift'
import { deslug, liftOptions, matchesName, nameProblem, slugify } from './liftNames'

describe('slugify and deslug', () => {
  it('makes lower-case hyphenated words', () => {
    expect(slugify('  Bulgarian Split  squat! ')).toBe('bulgarian-split-squat')
    expect(deslug('bulgarian-split-squat')).toBe('Bulgarian split squat')
  })
  it('drops accents', () => {
    expect(slugify('Café curl')).toBe('cafe-curl')
  })
  it('keeps only a-z and 0-9', () => {
    expect(slugify('Zercher (2 sec) squat')).toBe('zercher-2-sec-squat')
    expect(slugify('★ !!')).toBe('')
  })
  it('stops at 48 characters without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug).toMatch(LIFT_EXERCISE_PATTERN)
    expect(slugify(`${'a'.repeat(47)} b`)).toBe('a'.repeat(47))
  })
})

describe('liftOptions', () => {
  it('lists recent lifts first, with their equipment', () => {
    const rows = liftOptions('', [{ exercise: 'deadlift', equipment: 'barbell' }])
    expect(rows[0]).toMatchObject({
      exercise: 'deadlift',
      equipment: 'barbell',
      label: 'Deadlift, barbell',
    })
    expect(rows.length).toBeGreaterThan(10)
  })
  it('lists a repeated recent lift once', () => {
    const same = { exercise: 'deadlift', equipment: 'barbell' as const }
    expect(liftOptions('dead', [same, same]).filter((row) => row.equipment)).toHaveLength(1)
  })
  it('lists catalog names before recent lifts once typing, and recent first before', () => {
    const recent = [{ exercise: 'deadlift', equipment: 'barbell' as const }]
    expect(liftOptions('dead', recent).map((r) => r.label)).toEqual([
      'Deadlift',
      'Sumo deadlift',
      'Romanian deadlift',
      'Deadlift, barbell',
    ])
    expect(liftOptions('', recent)[0]?.label).toBe('Deadlift, barbell')
  })
  it('refuses a name with no usable slug or one over 48 characters, with no Add option', () => {
    expect(liftOptions('zzq'.repeat(20), [])).toEqual([])
    expect(nameProblem('zzq'.repeat(20))).toMatch(/48/)
    expect(nameProblem('★')).toMatch(/letters or numbers/)
    expect(nameProblem('zzq cable fly')).toBeNull()
  })
  it('matches word starts, any case and order', () => {
    expect(matchesName('Incline bench press', 'PRESS inc')).toBe(true)
    expect(matchesName('Incline bench press', 'ress')).toBe(false)
    const labels = liftOptions('bench', []).map((row) => row.label)
    expect(labels).toContain('Bench press')
    expect(labels).not.toContain('Deadlift')
  })
  it('offers the typed name as the last and only option when nothing matches', () => {
    expect(liftOptions('Zercher squat x', [])).toEqual([
      { exercise: 'zercher-squat-x', label: 'Add ‘Zercher squat x’', isNew: true },
    ])
    expect(liftOptions('★', [])).toEqual([])
  })
})
