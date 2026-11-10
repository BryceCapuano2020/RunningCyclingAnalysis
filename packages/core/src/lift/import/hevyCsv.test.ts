import { describe, expect, it } from 'vitest'
import { MAX_CSV_CELLS_PER_ROW } from '../../import/limits'
import { MAX_LIFT_SETS_PER_USER } from '../limits'
import { readHevyCsv } from './hevyCsv'
import type { HevyCsvResult } from './hevyAssemble'

const HEADER_A =
  'Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps,Distance (m),Duration (s),Notes,RPE'
const HEADER_B =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'

function read(text: string, units?: 'kg' | 'lb'): HevyCsvResult {
  const r = readHevyCsv(text, units === undefined ? {} : { units })
  if ('refused' in r) throw new Error(r.refused)
  return r
}

const T1 = '2031-03-02 07:30:00'
const T2 = '2031-03-02 18:00:00'
const SQ = 'Squat (Barbell)'

/** A layout B row: start, exercise, set index, set type, kg, reps, then optional columns. */
function b(
  start: string,
  exercise: string,
  index: number | string,
  type: string,
  kg: string,
  reps: string,
  rest: { dist?: string; dur?: string; rpe?: string; title?: string } = {},
): string {
  const cells = [rest.title ?? 'Day', start, '', '', exercise, '', '', index, type, kg, reps]
  return [...cells, rest.dist ?? '', rest.dur ?? '', rest.rpe ?? ''].join(',')
}

/** Layout B text from rows. */
const fileB = (...rows: string[]): string => [HEADER_B, ...rows].join('\n')

describe('header detection', () => {
  it('reads layout A', () => {
    const r = read(`${HEADER_A}\n${T1},Day,${SQ},1,100,5,,,note,8`)
    expect(r.layout).toBe('A')
    expect(r.sets[0]).toEqual({
      date: '2031-03-02',
      time: '07:30',
      timePrecision: 'session',
      exercise: 'back-squat',
      equipment: 'barbell',
      setOrder: 1,
      reps: 5,
      loadKg: 100,
      rpe: 8,
    })
  })

  it('reads layout B, ignoring header case and a BOM', () => {
    const r = read(
      `﻿${HEADER_B.toUpperCase()}\n${b(T1, 'Bench Press (Barbell)', 0, 'normal', '60', '8')}`,
    )
    expect(r.layout).toBe('B')
    expect(r.sets[0]).toMatchObject({ exercise: 'bench-press', setOrder: 1, loadKg: 60 })
  })

  it('refuses an unknown header, and a Hevy one missing a column, by name', () => {
    expect(readHevyCsv('a,b,c\n1,2,3')).toEqual({ refused: expect.stringContaining('Not a Hevy') })
    const short = 'title,start_time,exercise_title,set_index,weight_kg\nx,y,z,1,2'
    expect(readHevyCsv(short)).toEqual({ refused: expect.stringContaining('"reps"') })
  })

  it('refuses an empty file and reads a header alone as no sets', () => {
    expect(readHevyCsv('')).toEqual({ refused: expect.stringContaining('empty') })
    expect(read(HEADER_B).sets).toEqual([])
  })
})

describe('rows', () => {
  it('handles quoting and commas in titles', () => {
    const r = read(
      `${HEADER_B}\n"Push, Pull ""A""",${T1},,,"Curl, Cable (Cable)",,"a, note",1,normal,20,10,,,`,
    )
    expect(r.sets[0]).toMatchObject({ exercise: 'curl-cable', equipment: 'cable' })
    expect(r.customExercises).toEqual(['curl-cable'])
  })

  it('writes no time for a date-only start', () => {
    const r = read(fileB(b('2031-03-02', 'Deadlift (Barbell)', 1, 'normal', '140', '3')))
    expect(r.sets[0]).not.toHaveProperty('time')
    expect(r.sets[0]).not.toHaveProperty('timePrecision')
  })

  it('converts lb to kg at two decimals', () => {
    const lb = HEADER_B.replace('weight_kg', 'weight_lbs')
    expect(
      read(`${lb}\n${b(T1, 'Bench Press (Barbell)', 1, 'normal', '225', '5')}`).sets[0]?.loadKg,
    ).toBe(102.06)
    const bare = `${HEADER_A.replace('Weight (kg)', 'Weight')}\n${T1},Day,${SQ},1,225,5,,,,`
    expect(read(bare, 'lb').sets[0]?.loadKg).toBe(102.06)
  })

  it('maps warmup and failure, and keeps a given RPE on failure', () => {
    const r = read(
      fileB(
        b(T1, SQ, 1, 'warmup', '40', '10'),
        b(T1, SQ, 2, 'normal', '100', '5'),
        b(T1, SQ, 3, 'dropset', '80', '8'),
        b(T1, SQ, 4, 'failure', '100', '5'),
        b(T1, SQ, 5, 'failure', '100', '4', { rpe: '9.5' }),
      ),
    )
    expect(r.sets.map((s) => [s.warmup, s.rpe])).toEqual([
      [true, undefined],
      [undefined, undefined],
      [undefined, undefined],
      [undefined, 10],
      [undefined, 9.5],
    ])
  })

  it('reads W, F and D in the Strong-style set order, per exercise', () => {
    const rows = [
      `W,${SQ},40,10`,
      `1,${SQ},100,5`,
      `F,${SQ},100,5`,
      `W,Bench Press (Barbell),40,10`,
    ]
    const lines = rows
      .map((x) => x.split(','))
      .map(([i, e, w, n]) => `${T1},Day,${e},${i},${w},${n},,,,`)
    const r = read([HEADER_A, ...lines].join('\n'))
    expect(r.sets.map((s) => [s.exercise, s.warmup, s.rpe, s.setOrder])).toEqual([
      ['back-squat', true, undefined, 1],
      ['back-squat', undefined, undefined, 2],
      ['back-squat', undefined, 10, 3],
      ['bench-press', true, undefined, 1],
    ])
  })

  it('drops an RPE off the half steps into adjusted, and reads 0 as none', () => {
    const r = read(
      fileB(
        b(T1, SQ, 1, 'normal', '100', '5', { rpe: '8.3' }),
        b(T1, SQ, 2, 'normal', '100', '5', { rpe: '11' }),
        b(T1, SQ, 3, 'failure', '100', '5', { rpe: '0' }),
        b(T1, SQ, 4, 'normal', '100', '5', { rpe: '7.5' }),
      ),
    )
    expect(r.sets.map((s) => s.rpe)).toEqual([undefined, undefined, 10, 7.5])
    expect(r.adjusted.map((s) => s.row)).toEqual([2, 3])
    expect(r.skipped).toEqual([])
  })

  it('skips rows that are not sets, each with its reason', () => {
    const r = read(
      fileB(
        b(T1, 'Running (Bodyweight)', 1, 'normal', '', '', { dist: '5' }),
        b(T1, 'Plank (Bodyweight)', 1, 'normal', '', '0', { dur: '60' }),
        b(T1, SQ, 1, 'normal', '100', '5', { dur: '30' }),
        b('02/03/2031', SQ, 1, 'normal', '100', '5'),
        b(T1, SQ, 1, 'amrap', '100', '5'),
        b(T1, SQ, 1, 'normal', '5000', '5'),
        b(T1, SQ, 1, 'normal', 'abc', '5'),
        b(T1, SQ, 1, 'normal', '100', '5.5'),
        b(T1, SQ, 1, 'normal', '-20', '5'),
        b(T1, SQ, 1, 'normal', '100', ''),
        b('2031-03-02T07:30:00Z', SQ, 1, 'normal', '100', '5'),
      ),
    )
    expect(r.sets).toHaveLength(1)
    expect(r.skipped.map((s) => s.row)).toEqual([2, 3, 5, 6, 7, 8, 9, 10, 11, 12])
    const why = r.skipped.map((s) => s.reason)
    expect(why[0]).toContain('distance or duration')
    expect(why[1]).toContain('distance or duration')
    expect(why[2]).toContain('date')
    expect(why[3]).toContain('set type')
    expect(why[4]).toContain('limits')
    expect(why[9]).toContain('time zone')
  })
})

describe('set order', () => {
  it('renumbers across two workouts on one day, in time order, whatever the file order', () => {
    const r = read(
      fileB(
        b(T2, SQ, 1, 'normal', '90', '5', { title: 'Evening' }),
        b(T2, SQ, 2, 'normal', '90', '5', { title: 'Evening' }),
        b(T1, SQ, 1, 'normal', '100', '5', { title: 'Morning' }),
        b(T1, SQ, 2, 'normal', '100', '5', { title: 'Morning' }),
        b(T1, 'Squat (Dumbbell)', 1, 'normal', '20', '8', { title: 'Morning' }),
      ),
    )
    expect(r.sets.map((s) => [s.time, s.equipment, s.setOrder, s.loadKg])).toEqual([
      ['18:00', 'barbell', 3, 90],
      ['18:00', 'barbell', 4, 90],
      ['07:30', 'barbell', 1, 100],
      ['07:30', 'barbell', 2, 100],
      ['07:30', 'dumbbell', 1, 20],
    ])
  })

  it('orders within a workout by the file set index, and keeps date-only workouts apart', () => {
    const r = read(
      fileB(
        b('2031-03-02', SQ, 3, 'normal', '102', '5', { title: 'A' }),
        b('2031-03-02', SQ, 1, 'normal', '100', '5', { title: 'A' }),
        b('2031-03-02', SQ, 1, 'normal', '90', '5', { title: 'B' }),
      ),
    )
    expect(r.sets.map((s) => [s.setOrder, s.loadKg])).toEqual([
      [2, 102],
      [1, 100],
      [3, 90],
    ])
  })
})

describe('limits', () => {
  it('refuses a row with too many cells and an open quote', () => {
    const cells = readHevyCsv(`${HEADER_B}\n${','.repeat(MAX_CSV_CELLS_PER_ROW)}`)
    expect(cells).toEqual({ refused: expect.stringContaining('limit') })
    expect(readHevyCsv(`${HEADER_B}\n"x,${T1}`)).toHaveProperty('refused')
  })

  it('refuses a file with more rows than an account may keep', () => {
    const row = b(T1, SQ, 1, 'normal', '20', '5')
    const text = fileB(...Array<string>(MAX_LIFT_SETS_PER_USER + 1).fill(row))
    expect(readHevyCsv(text)).toEqual({
      refused: expect.stringContaining(String(MAX_LIFT_SETS_PER_USER)),
    })
  })
})
