import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT,
  EXERCISE_CATALOG,
  compareLiftSetKeys,
  decodeLiftCursor,
  encodeLiftCursor,
  isExerciseSlug,
  LIFT_REVISION,
  exerciseInfo,
  exerciseKeyOf,
  isLiftLoad,
  isLiftRpe,
  liftSetKey,
  parseLiftSetKey,
  readLiftSet,
} from './index'
import type { LiftSet } from './index'
import { slugify } from './slug'

const set: LiftSet = {
  date: '2026-03-02',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: 3,
  reps: 5,
  loadKg: 100,
}

describe('key', () => {
  it('writes the documented form and round-trips', () => {
    expect(liftSetKey(set)).toBe('2026-03-02.back-squat.barbell.3')
    for (const equipment of EQUIPMENT) {
      const s = { ...set, equipment, setOrder: 200 }
      expect(parseLiftSetKey(liftSetKey(s))).toEqual({
        date: s.date,
        exercise: s.exercise,
        equipment,
        setOrder: 200,
      })
    }
    expect(exerciseKeyOf(set)).toBe('back-squat.barbell')
  })
  it('refuses text that is not a key', () => {
    for (const text of [
      '',
      '2026-03-02.back-squat.barbell',
      '2026-03-02.back-squat.barbell.3.1',
      '2026-02-30.back-squat.barbell.3',
      '1969-12-31.back-squat.barbell.3',
      '2026-03-02.Back-Squat.barbell.3',
      '2026-03-02.back-squat.rope.3',
      '2026-03-02.back-squat.barbell.0',
      '2026-03-02.back-squat.barbell.201',
      '2026-03-02.back-squat.barbell.03',
      '2026-03-02.back-squat.barbell.1.5',
    ])
      expect(parseLiftSetKey(text), text).toBeNull()
  })
})

describe('order and cursor', () => {
  it('sorts set order numerically, then by the earlier fields', () => {
    const keys = [
      '2026-03-02.back-squat.barbell.10',
      '2026-03-02.back-squat.barbell.2',
      '2026-03-01.deadlift.barbell.1',
      '2026-03-02.back-squat.smith.1',
      '2026-03-02.bench-press.barbell.1',
    ]
    expect([...keys].sort(compareLiftSetKeys)).toEqual([
      '2026-03-01.deadlift.barbell.1',
      '2026-03-02.back-squat.barbell.2',
      '2026-03-02.back-squat.barbell.10',
      '2026-03-02.back-squat.smith.1',
      '2026-03-02.bench-press.barbell.1',
    ])
    expect(compareLiftSetKeys(keys[0] as string, keys[0] as string)).toBe(0)
  })
  it('round-trips a cursor and refuses garbage', () => {
    const id = {
      date: '2026-03-02',
      exercise: 'back-squat',
      equipment: 'barbell' as const,
      setOrder: 10,
    }
    const cursor = encodeLiftCursor(id)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeLiftCursor(cursor)).toEqual(id)
    for (let setOrder = 1; setOrder <= 200; setOrder++)
      for (const exercise of ['a', 'ab', 'abc'])
        expect(decodeLiftCursor(encodeLiftCursor({ ...id, exercise, setOrder }))).toEqual({
          ...id,
          exercise,
          setOrder,
        })
    for (const bad of ['', '!!!', 'abc', 'WzEsMl0', 'eyJhIjoxfQ', 'WyJ4IiwieSIsInoiLDFd'])
      expect(decodeLiftCursor(bad), bad).toBeNull()
  })
})

describe('catalog', () => {
  it('has only valid slugs', () => {
    for (const slug of Object.keys(EXERCISE_CATALOG)) expect(isExerciseSlug(slug), slug).toBe(true)
  })
  it('keeps each entry consistent: slug is slugify(name), names unique, flags agree', () => {
    const names = new Set<string>()
    for (const [slug, info] of Object.entries(EXERCISE_CATALOG)) {
      expect(slugify(info.name), slug).toBe(slug)
      expect(names.has(info.name.toLowerCase()), slug).toBe(false)
      names.add(info.name.toLowerCase())
      if (info.deadliftFamily) expect(info.region, slug).toBe('lower')
      if (info.deadliftFamily) expect(info.bodyweight, slug).toBeUndefined()
      if (info.pair) expect(info.bodyweight, slug).toBeUndefined()
    }
  })
  it('knows the accessory lifts, trunk work as other', () => {
    expect(exerciseInfo('face-pull')).toMatchObject({ name: 'Face pull', region: 'upper' })
    expect(exerciseInfo('seated-dumbbell-shoulder-press').pair).toBe(true)
    expect(exerciseInfo('trap-bar-deadlift').deadliftFamily).toBe(true)
    expect(exerciseInfo('hanging-leg-raise')).toMatchObject({ region: 'other', bodyweight: true })
    expect(exerciseInfo('standing-calf-raise').region).toBe('lower')
  })
  it('knows common lifts and calls the rest other', () => {
    expect(exerciseInfo('sumo-deadlift')).toMatchObject({ region: 'lower', deadliftFamily: true })
    expect(exerciseInfo('pull-up')).toMatchObject({ region: 'upper', bodyweight: true })
    expect(exerciseInfo('dumbbell-row').pair).toBe(true)
    expect(exerciseInfo('deadlift').pair).toBeUndefined()
    expect(exerciseInfo('zercher-carry').region).toBe('other')
    expect(exerciseInfo('constructor').region).toBe('other')
  })
})

describe('readLiftSet bounds', () => {
  const ok = (patch: Record<string, unknown>) => readLiftSet({ ...set, ...patch }) !== null
  it('applies every bound at its edge, both ways', () => {
    expect(ok({})).toBe(true)
    expect([ok({ reps: 1 }), ok({ reps: 100 }), ok({ reps: 0 }), ok({ reps: 101 })]).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(ok({ reps: 2.5 })).toBe(false)
    expect([ok({ loadKg: 0 }), ok({ loadKg: 1000 }), ok({ loadKg: -0.01 })]).toEqual([
      true,
      true,
      false,
    ])
    expect([ok({ loadKg: 1000.01 }), ok({ loadKg: 62.55 }), ok({ loadKg: 62.555 })]).toEqual([
      false,
      true,
      false,
    ])
    expect([ok({ loadKg: Number.NaN }), ok({ loadKg: Infinity })]).toEqual([false, false])
    expect([ok({ rpe: 1 }), ok({ rpe: 10 }), ok({ rpe: 7.5 })]).toEqual([true, true, true])
    expect([ok({ rpe: 0.5 }), ok({ rpe: 10.5 }), ok({ rpe: 7.25 })]).toEqual([false, false, false])
    expect([ok({ setOrder: 1 }), ok({ setOrder: 200 }), ok({ setOrder: 0 })]).toEqual([
      true,
      true,
      false,
    ])
    expect(ok({ setOrder: 201 })).toBe(false)
    expect([ok({ exercise: 'a' }), ok({ exercise: 'a'.repeat(48) })]).toEqual([true, true])
    expect([ok({ exercise: '' }), ok({ exercise: 'a'.repeat(49) })]).toEqual([false, false])
    expect([ok({ exercise: 'a--b' }), ok({ exercise: '-a' }), ok({ exercise: 'A' })]).toEqual([
      false,
      false,
      false,
    ])
    expect([ok({ date: '1970-01-01' }), ok({ date: '2100-12-31' })]).toEqual([true, true])
    expect([ok({ date: '1969-12-31' }), ok({ date: '2101-01-01' })]).toEqual([false, false])
    expect([ok({ date: '2026-3-2' }), ok({ date: '2026-02-30' })]).toEqual([false, false])
    expect(ok({ equipment: 'rope' })).toBe(false)
    expect([ok({ warmup: true }), ok({ warmup: false })]).toEqual([true, false])
  })
  it('takes time and precision together, and nothing else', () => {
    const t = { time: '00:00', timePrecision: 'set' }
    expect([ok(t), ok({ time: '23:59', timePrecision: 'session' })]).toEqual([true, true])
    expect([
      ok({ time: '24:00', timePrecision: 'set' }),
      ok({ time: '12:60', timePrecision: 'set' }),
    ]).toEqual([false, false])
    expect([
      ok({ time: '9:00', timePrecision: 'set' }),
      ok({ time: '09:00', timePrecision: 'x' }),
    ]).toEqual([false, false])
    expect([ok({ time: '09:00' }), ok({ timePrecision: 'set' })]).toEqual([false, false])
    expect(ok({ note: 'felt good' })).toBe(false)
    expect([readLiftSet(null), readLiftSet([]), readLiftSet('x')]).toEqual([null, null, null])
  })
  it('returns the set unchanged', () => {
    const full: LiftSet = { ...set, time: '07:30', timePrecision: 'session', rpe: 8, warmup: true }
    expect(readLiftSet(full)).toEqual(full)
  })
  it('exposes the predicates and a revision', () => {
    expect([isLiftLoad(0.1 + 0.2), isLiftRpe('8')]).toEqual([true, false])
    expect(LIFT_REVISION).toBe(3)
  })
})
