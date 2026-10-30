import { describe, expect, it } from 'vitest'
import { applyHold, weekEndOf } from './machine'
import type { MachineState, WeekRecord } from './machine'
import { enteredAt } from './status'

const rec = (w: number, state: MachineState, fresh = false, z = Number.NaN): WeekRecord => ({
  w,
  state,
  fresh,
  z,
  delta: 0,
  episode: null,
  closes: null,
  dip: null,
  shown: state,
})

/** Records from states, one a week from week 10, with the display hold applied. */
function weeks(states: [MachineState, boolean?, number?][]): WeekRecord[] {
  const records = states.map(([state, fresh, z], i) => rec(10 + i, state, fresh ?? false, z))
  applyHold(records)
  return records
}

describe('enteredAt', () => {
  it('dates a state to the week it was first shown, with the statistic that began it', () => {
    const records = weeks([
      ['holding'],
      ['holding'],
      ['slipping', true, -3.6],
      ['slipping'],
      ['slipping'],
    ])
    expect(enteredAt(records)).toEqual({ atMs: weekEndOf(12), z: -3.6 })
  })

  it('does not end a state at weeks of thin evidence in the middle of it', () => {
    const records = weeks([['holding'], ['slipping', true, -3.4], ['thin'], ['thin'], ['slipping']])
    expect(enteredAt(records)).toEqual({ atMs: weekEndOf(11), z: -3.4 })
  })

  it('does not count weeks of thin evidence before a new state as part of it', () => {
    const records = weeks([
      ['holding'],
      ['slipping', true, -3.4],
      ['slipping'],
      ['thin'],
      ['thin'],
      ['recovering', true, 4.9],
      ['recovering'],
      ['recovering'],
    ])
    // Shown after two weeks, since the weeks before it were not calm; the thin weeks are not part of it.
    expect(records[5]!.shown).toBe('slipping')
    expect(enteredAt(records)).toEqual({ atMs: weekEndOf(16), z: 4.9 })
  })

  it('finds the statistic on the week the monitor changed when the display held it back a week', () => {
    const records = weeks([
      ['slipping', true, -3.5],
      ['slipping'],
      ['recovering', true, 5.2],
      ['recovering'],
      ['recovering'],
    ])
    // The hold shows "recovering" a week after the monitor said so.
    expect(records[2]!.shown).toBe('slipping')
    expect(enteredAt(records)).toEqual({ atMs: weekEndOf(13), z: 5.2 })
  })

  it('is null for holding and for a state that was there from the first week', () => {
    expect(enteredAt(weeks([['holding'], ['holding'], ['holding']]))).toBeNull()
    expect(enteredAt(weeks([['slipping'], ['slipping']]))).toBeNull()
  })
})
