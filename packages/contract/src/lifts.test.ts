import { describe, expect, it } from 'vitest'
import {
  MAX_LIFT_KEYS_PER_DELETE,
  MAX_LIFT_SETS_PER_WRITE,
  LIFT_YEARS,
  liftSetKey,
  readLiftSet,
} from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { LiftDeleteSchema, LiftPageSchema, LiftSetSchema, LiftWriteSchema } from './lifts.ts'
import { MEASUREMENT_YEARS } from './measurements.ts'

const set: LiftSet = {
  date: '2026-03-02',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: 3,
  reps: 5,
  loadKg: 100,
}

describe('LiftSetSchema', () => {
  it('agrees with readLiftSet on a sweep of edge values', () => {
    const edges: Record<string, unknown[]> = {
      date: ['1970-01-01', '1969-12-31', '2100-12-31', '2101-01-01', '2026-02-30', '2026-3-2', 5],
      exercise: ['a', '', 'a'.repeat(48), 'a'.repeat(49), 'a--b', '-a', 'A', 'a b', 7],
      equipment: ['barbell', 'other', 'rope', '', null],
      setOrder: [0, 1, 200, 201, 1.5, -1, '1'],
      reps: [0, 1, 100, 101, 2.5, Number.NaN, '5'],
      loadKg: [-0.01, 0, 0.01, 62.555, 1000, 1000.01, Infinity, Number.NaN, '5'],
      rpe: [undefined, 0.5, 1, 7.25, 7.5, 10, 10.5, '8'],
      warmup: [undefined, true, false, 1],
      time: [undefined, '00:00', '23:59', '24:00', '12:60', '9:00', 900],
      timePrecision: [undefined, 'set', 'session', 'day'],
    }
    let checked = 0
    for (const [field, values] of Object.entries(edges)) {
      for (const value of values) {
        const candidate = { ...set, [field]: value }
        expect(LiftSetSchema.safeParse(candidate).success, `${field}=${String(value)}`).toBe(
          readLiftSet(candidate) !== null,
        )
        checked++
      }
    }
    for (const time of edges.time ?? []) {
      for (const timePrecision of edges.timePrecision ?? []) {
        const candidate = { ...set, time, timePrecision }
        expect(LiftSetSchema.safeParse(candidate).success).toBe(readLiftSet(candidate) !== null)
        checked++
      }
    }
    for (const extra of [{ note: 'x' }, { time: '07:00' }, { rpe: 8, warmup: true }]) {
      const candidate = { ...set, ...extra }
      expect(LiftSetSchema.safeParse(candidate).success).toBe(readLiftSet(candidate) !== null)
      checked++
    }
    expect(checked).toBeGreaterThan(80)
  })

  it('refuses each bound just outside and takes it at the edge', () => {
    const ok = (patch: object) => LiftSetSchema.safeParse({ ...set, ...patch }).success
    expect([ok({}), ok({ reps: 100 }), ok({ reps: 101 })]).toEqual([true, true, false])
    expect([ok({ loadKg: 1000 }), ok({ loadKg: 1000.01 }), ok({ loadKg: 1.234 })]).toEqual([
      true,
      false,
      false,
    ])
    expect([ok({ rpe: 1 }), ok({ rpe: 10 }), ok({ rpe: 9.75 })]).toEqual([true, true, false])
    expect([ok({ setOrder: 200 }), ok({ setOrder: 201 })]).toEqual([true, false])
    expect(ok({ time: '07:00' })).toBe(false)
    expect(ok({ time: '07:00', timePrecision: 'set' })).toBe(true)
    expect(ok({ unknown: 1 })).toBe(false)
  })

  it('uses the same years as dated settings', () => {
    expect(LIFT_YEARS).toEqual(MEASUREMENT_YEARS)
  })
})

describe('write, delete and page', () => {
  it('bounds the number of sets in a write', () => {
    const many = (n: number) => ({ sets: Array.from({ length: n }, () => set) })
    expect(LiftWriteSchema.safeParse(many(0)).success).toBe(false)
    expect(LiftWriteSchema.safeParse(many(1)).success).toBe(true)
    expect(LiftWriteSchema.safeParse(many(MAX_LIFT_SETS_PER_WRITE)).success).toBe(true)
    expect(LiftWriteSchema.safeParse(many(MAX_LIFT_SETS_PER_WRITE + 1)).success).toBe(false)
    expect(LiftWriteSchema.safeParse({ ...many(1), extra: 1 }).success).toBe(false)
  })
  it('bounds the keys in a delete and checks each', () => {
    const key = liftSetKey(set)
    const many = (n: number) => ({ keys: Array.from({ length: n }, () => key) })
    expect(LiftDeleteSchema.safeParse(many(0)).success).toBe(false)
    expect(LiftDeleteSchema.safeParse(many(MAX_LIFT_KEYS_PER_DELETE)).success).toBe(true)
    expect(LiftDeleteSchema.safeParse(many(MAX_LIFT_KEYS_PER_DELETE + 1)).success).toBe(false)
    expect(LiftDeleteSchema.safeParse({ keys: [key, 'not-a-key'] }).success).toBe(false)
  })
  it('reads a page with and without a next cursor', () => {
    expect(LiftPageSchema.safeParse({ items: [set], next: 'abc' }).success).toBe(true)
    expect(LiftPageSchema.safeParse({ items: [], next: null }).success).toBe(true)
    expect(LiftPageSchema.safeParse({ items: [] }).success).toBe(false)
    expect(LiftPageSchema.safeParse({ items: [{ ...set, reps: 0 }], next: null }).success).toBe(
      false,
    )
  })
})
