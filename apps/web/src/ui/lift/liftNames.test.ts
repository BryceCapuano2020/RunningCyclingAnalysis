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
      'Stiff-leg deadlift',
      'Trap bar deadlift',
      'Deadlift, barbell',
    ])
    expect(liftOptions('', recent)[0]?.label).toBe('Deadlift, barbell')
  })
  it('finds the accessory lifts by their words', () => {
    expect(liftOptions('pec fly', []).map((r) => r.label)).toContain('Pec deck fly')
    expect(liftOptions('triceps pressdown', []).map((r) => r.exercise)).toEqual([
      'triceps-pressdown',
    ])
    expect(liftOptions('hanging leg', []).map((r) => r.exercise)).toEqual(['hanging-leg-raise'])
    expect(liftOptions('calf', []).map((r) => r.exercise)).toEqual([
      'calf-raise',
      'standing-calf-raise',
      'seated-calf-raise',
    ])
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
  it('lists 12 used lifts before typing, and searches every one once typing', () => {
    const used = Array.from({ length: 14 }, (_, n) => ({
      exercise: `zzq-lift-${n}`,
      equipment: 'machine' as const,
    }))
    expect(liftOptions('', used).filter((row) => row.equipment)).toHaveLength(12)
    expect(liftOptions('zzq lift 13', used).map((row) => row.label)).toEqual([
      'Zzq lift 13, machine',
    ])
  })
  it('matches a used lift with its equipment, so "curl cable" finds it rather than adding a lift', () => {
    const recent = [
      { exercise: 'curl', equipment: 'cable' as const },
      { exercise: 'zzq-press', equipment: 'dumbbell' as const },
    ]
    // The lift used leads; catalog names found by leaving out "cable" follow it, and it is listed once.
    const labels = liftOptions('curl cable', recent).map((row) => row.label)
    expect(labels[0]).toBe('Curl, cable')
    expect(labels).toContain('Leg curl, cable')
    expect(labels.filter((label) => label === 'Curl, cable')).toHaveLength(1)
    expect(liftOptions('zzq press, dumbbell', recent)).toEqual([
      { exercise: 'zzq-press', equipment: 'dumbbell', label: 'Zzq press, dumbbell' },
    ])
  })
  it('finds a catalog name typed with an equipment word, with that equipment', () => {
    expect(liftOptions('bench press dumbbell', [])[0]).toEqual({
      exercise: 'bench-press',
      equipment: 'dumbbell',
      label: 'Bench press, dumbbell',
    })
    expect(liftOptions('deadlift barbell', []).map((row) => row.label)).not.toContain(
      'Add ‘Deadlift barbell’',
    )
    // Two equipment words name no one equipment, and an equipment word alone lists nothing extra.
    expect(liftOptions('curl cable dumbbell', []).find((row) => row.exercise === 'curl')).toEqual({
      exercise: 'curl',
      label: 'Curl',
    })
    expect(liftOptions('cable', []).map((row) => row.label)).toEqual(['Cable row'])
  })
  it('offers the typed name as the last and only option when nothing matches', () => {
    expect(liftOptions('Zercher squat x', [])).toEqual([
      { exercise: 'zercher-squat-x', label: 'Add ‘Zercher squat x’', isNew: true },
    ])
    expect(liftOptions('★', [])).toEqual([])
  })
})
