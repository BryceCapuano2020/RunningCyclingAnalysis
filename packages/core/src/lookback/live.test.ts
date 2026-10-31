import { describe, expect, it } from 'vitest'
import type { MachineState, WeekRecord } from '../fitness/machine'
import { liveEpisodes } from './live'

const record = (w: number, state: MachineState, fresh = false): WeekRecord =>
  ({ w, state, fresh }) as WeekRecord

describe('the slips the card declared', () => {
  const weeks = (...states: [MachineState, boolean?][]) =>
    states.map(([state, fresh], w) => record(w, state, fresh))

  it('lists each declared slip with the week it reached back', () => {
    const records = weeks(
      ['holding'],
      ['slipping', true],
      ['slipping'],
      ['recovering', true],
      ['back', true],
      ['back'],
      ['holding'],
      ['slipping', true],
      ['holding-below', true],
    )
    expect(liveEpisodes(records, 100)).toEqual([
      { declaredWeek: 1, backWeek: 4, recoveringWeek: 3, relapsed: false },
      { declaredWeek: 7, backWeek: null, recoveringWeek: null, relapsed: false },
    ])
  })

  it('marks a slip reopened straight out of back, as the same episode', () => {
    const records = weeks(['slipping', true], ['back', true], ['slipping', true])
    expect(liveEpisodes(records, 100)).toEqual([
      { declaredWeek: 0, backWeek: 1, recoveringWeek: null, relapsed: true },
    ])
  })

  it('reads nothing past the horizon', () => {
    const records = weeks(['slipping', true], ['slipping'], ['back', true])
    expect(liveEpisodes(records, 1)).toEqual([
      { declaredWeek: 0, backWeek: null, recoveringWeek: null, relapsed: false },
    ])
  })
})
