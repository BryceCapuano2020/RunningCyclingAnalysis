import { describe, expect, it } from 'vitest'
import { LabelUndo } from './labelUndo'

const applied = [{ id: 'a', revision: 6, from: null, athleteType: 'hike' as const }]

describe('LabelUndo', () => {
  it('gives the labels back once, for the account and the library they were applied to', () => {
    const undo = new LabelUndo()
    undo.remember('u1', 3, applied)
    expect(undo.take('u1', 3)).toEqual(applied)
    expect(undo.take('u1', 3)).toEqual([])
  })

  it('gives nothing to another account, or after the library has changed, and forgets them', () => {
    const undo = new LabelUndo()
    undo.remember('u1', 3, applied)
    expect(undo.take('u2', 3)).toEqual([])
    undo.remember('u1', 3, applied)
    expect(undo.take('u1', 4)).toEqual([])
    expect(undo.take('u1', 3)).toEqual([])
  })

  it('forgets them on clear', () => {
    const undo = new LabelUndo()
    undo.remember('u1', 3, applied)
    undo.clear()
    expect(undo.take('u1', 3)).toEqual([])
  })

  it('keeps nothing for an import that applied none, and the newest import replaces the one before', () => {
    const undo = new LabelUndo()
    undo.remember('u1', 1, applied)
    undo.remember('u1', 1, [])
    expect(undo.take('u1', 1)).toEqual([])
  })
})
