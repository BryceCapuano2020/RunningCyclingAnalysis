import { describe, expect, it } from 'vitest'
import { deslug, liftOptions, matchesName, nameProblem } from './liftNames'

describe('deslug', () => {
  it('turns a slug into a name', () => {
    expect(deslug('bulgarian-split-squat')).toBe('Bulgarian split squat')
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
