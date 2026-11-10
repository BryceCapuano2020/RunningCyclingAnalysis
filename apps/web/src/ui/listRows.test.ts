import { describe, expect, it } from 'vitest'
import type { LiftRow } from './activitiesLift'
import { makeActivity } from './components/test/fixtures'
import { rowKeyOf, withLiftRows } from './listRows'
import type { ListRow } from './listRows'
import { rowEntries } from './sessions'

const HOUR = 3_600_000

function lift(startMs: number, seconds = 2400): LiftRow {
  return {
    day: Math.floor(startMs / (24 * HOUR)),
    date: `day-${startMs}`,
    startMs,
    seconds,
    measured: false,
    sets: 12,
    timed: false,
    name: 'Lift',
  }
}

const keys = (rows: ListRow[]) => rows.map(rowKeyOf)

describe('withLiftRows', () => {
  const a = makeActivity({ id: 'a', startMs: 10 * HOUR, durationS: 1800, distanceM: 5000 })
  const b = makeActivity({ id: 'b', startMs: 30 * HOUR, durationS: 5400, distanceM: 0 })

  it('is the rows as given with no lifting days', () => {
    const entries = rowEntries([b, a], true)
    expect(withLiftRows(entries, [], 'newest')).toEqual(entries)
  })

  it('merges lifting days by start in a date sort, keeping the rows in their order', () => {
    const lifts = [lift(5 * HOUR), lift(20 * HOUR), lift(40 * HOUR)]
    expect(keys(withLiftRows(rowEntries([b, a], true), lifts, 'newest'))).toEqual([
      `lift:day-${40 * HOUR}`,
      'b',
      `lift:day-${20 * HOUR}`,
      'a',
      `lift:day-${5 * HOUR}`,
    ])
    expect(keys(withLiftRows(rowEntries([a, b], true), lifts, 'oldest'))).toEqual([
      `lift:day-${5 * HOUR}`,
      'a',
      `lift:day-${20 * HOUR}`,
      'b',
      `lift:day-${40 * HOUR}`,
    ])
  })

  it('ranks a lifting day by its time in a time sort, and after every activity, ties too, by distance', () => {
    const lifts = [lift(20 * HOUR, 3600)]
    expect(keys(withLiftRows(rowEntries([b, a], false), lifts, 'time'))).toEqual([
      'b',
      `lift:day-${20 * HOUR}`,
      'a',
    ])
    expect(keys(withLiftRows(rowEntries([a, b], false), lifts, 'distance')).at(-1)).toBe(
      `lift:day-${20 * HOUR}`,
    )
  })

  it('places a session newest first by its last leg, so a lifting day never lands inside it', () => {
    const legs = [
      makeActivity({ id: 'leg1', startMs: 10 * HOUR, sessionKey: 's' }),
      makeActivity({ id: 'leg2', startMs: 12 * HOUR, sessionKey: 's' }),
    ]
    const rows = withLiftRows(rowEntries([legs[1]!, legs[0]!], true), [lift(11 * HOUR)], 'newest')
    expect(rows.map((row) => row.kind)).toEqual(['session', 'lift'])
  })
})
