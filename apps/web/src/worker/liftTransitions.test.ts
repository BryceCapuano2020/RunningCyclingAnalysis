import { describe, expect, it } from 'vitest'
import type { LiftSet } from '@rca/core/lift'
import {
  ackRow,
  deleteSet,
  holdRow,
  lackedRow,
  pulledRow,
  refuseRow,
  saveSet,
} from './liftTransitions'
import type { LiftRow, LiftRowState } from './liftTransitions'

const make = (loadKg: number): LiftSet => ({
  date: '2031-01-05',
  exercise: 'squat',
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg,
})
const BASE = { id: 'u|k', scope: 'u', key: 'k' }
const OLD = make(60)
const NEW = make(70)
const SERVER = make(80)

/** A row of the state, at rev 3, with confirmed values when `saved`. */
const row = (state: LiftRowState, saved: boolean): LiftRow => ({
  ...BASE,
  set: NEW,
  state,
  rev: 3,
  attempts: 2,
  ...(saved ? { saved: OLD, ackRevision: 7 } : {}),
})

describe('the transition table', () => {
  it('absent: save is put at rev 1; delete stays absent; a pull adds it synced', () => {
    expect(saveSet(undefined, BASE, NEW)).toMatchObject({ state: 'put', rev: 1, attempts: 0 })
    expect(deleteSet(undefined)).toBeUndefined()
    expect(pulledRow(undefined, BASE, SERVER, 9)).toMatchObject({
      state: 'synced',
      set: SERVER,
      ackRevision: 9,
    })
    expect(ackRow(undefined, 1, 9)).toBeUndefined()
  })

  it('synced: save is put and delete is delete, both at rev + 1; a pull takes the server values', () => {
    const synced = { ...row('synced', true), set: OLD }
    expect(saveSet(synced, BASE, NEW)).toMatchObject({ state: 'put', rev: 4, saved: OLD })
    expect(deleteSet(synced)).toMatchObject({ state: 'delete', rev: 4 })
    expect(pulledRow(synced, BASE, SERVER, 9)).toMatchObject({ state: 'synced', set: SERVER })
  })

  it('synced: a complete pull that lacks it removes it, unless it was confirmed at a newer revision', () => {
    const synced = row('synced', true)
    expect(lackedRow(synced, 7)).toBeNull()
    expect(lackedRow(synced, 8)).toBeNull()
    expect(lackedRow(synced, 6)).toBeUndefined()
  })

  it('put: save is put at rev + 1, delete is delete at rev + 1', () => {
    expect(saveSet(row('put', true), BASE, SERVER)).toMatchObject({
      state: 'put',
      rev: 4,
      set: SERVER,
      saved: OLD,
      attempts: 0,
    })
    expect(deleteSet(row('put', false))).toMatchObject({ state: 'delete', rev: 4 })
  })

  it('put: ack of its rev makes it synced with `saved` set; an older ack changes nothing', () => {
    expect(ackRow(row('put', false), 3, 12)).toMatchObject({
      state: 'synced',
      saved: NEW,
      ackRevision: 12,
      attempts: 0,
    })
    expect(ackRow(row('put', true), 2, 12)).toBeUndefined()
  })

  it('put: a 400 naming it goes back to `saved` as synced, or to absent without one', () => {
    expect(refuseRow(row('put', true), 3)).toMatchObject({ state: 'synced', set: OLD })
    expect(refuseRow(row('put', false), 3)).toBeNull()
  })

  it('put: a failure holds it with attempts + 1; a pull and a complete pull leave it', () => {
    expect(holdRow(row('put', true), 3)).toMatchObject({ state: 'put', attempts: 3 })
    expect(pulledRow(row('put', true), BASE, SERVER, 9)).toBeUndefined()
    expect(lackedRow(row('put', true), 99)).toBeUndefined()
  })

  it('delete: save is put at rev + 1; delete stays; ack of its rev removes it', () => {
    expect(saveSet(row('delete', true), BASE, SERVER)).toMatchObject({ state: 'put', rev: 4 })
    expect(deleteSet(row('delete', true))).toBeUndefined()
    expect(ackRow(row('delete', true), 3, 12)).toBeNull()
    expect(ackRow(row('delete', true), 2, 12)).toBeUndefined()
  })

  it('delete: a 400 goes back to `saved` as synced; a failure holds it; pulls leave it', () => {
    expect(refuseRow(row('delete', true), 3)).toMatchObject({ state: 'synced', set: OLD })
    expect(holdRow(row('delete', true), 3)).toMatchObject({ state: 'delete', attempts: 3 })
    expect(pulledRow(row('delete', true), BASE, SERVER, 9)).toBeUndefined()
    expect(lackedRow(row('delete', true), 99)).toBeUndefined()
  })

  it('a reply to an older send never moves a row that changed since', () => {
    for (const state of ['put', 'delete'] as const) {
      expect(refuseRow(row(state, true), 2)).toBeUndefined()
      expect(holdRow(row(state, true), 2)).toBeUndefined()
    }
  })
})
