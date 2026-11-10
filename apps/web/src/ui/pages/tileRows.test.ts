import { describe, expect, it } from 'vitest'
import { SPORT_ORDER } from '../sports'
import type { RecordRow } from '../recordRow'
import { RECORD_TILE_KEYS, tileRows } from './tileRows'

const row = (key: string): RecordRow => ({
  key,
  label: key,
  value: '1',
  sub: null,
  grade: null,
  tags: [],
  setDays: null,
  activity: null,
})

describe('tileRows', () => {
  it('names a run’s four distances and a ride’s four durations, in the order they are read', () => {
    expect(RECORD_TILE_KEYS.run).toEqual([
      'distance-1000',
      'distance-1609.344',
      'distance-5000',
      'distance-10000',
    ])
    expect(RECORD_TILE_KEYS.ride).toEqual(['60', '300', '1200', '3600'])
  })

  it('has a list of keys for every sport, so a new sport must say its own', () => {
    for (const sport of SPORT_ORDER) expect(RECORD_TILE_KEYS[sport].length).toBeGreaterThan(0)
  })

  it('takes a run’s distance rows in the sport’s order, not the list’s, and leaves the half marathon and durations out', () => {
    const rows = [
      row('300'),
      row('1200'),
      row('distance-10000'),
      row('distance-1000'),
      row('distance-21097.5'),
      row('distance-5000'),
    ]
    expect(tileRows('run', rows).map((tile) => tile.key)).toEqual([
      'distance-1000',
      'distance-5000',
      'distance-10000',
    ])
  })

  it('takes only the records that exist, so a ride without a one-minute best shows three', () => {
    expect(
      tileRows('ride', [row('300'), row('1200'), row('3600')]).map((tile) => tile.key),
    ).toEqual(['300', '1200', '3600'])
  })

  it('shows a run’s duration bests when it has none of its distance bests, so the strip is not empty', () => {
    const rows = [row('300'), row('1200'), row('3600')]
    expect(tileRows('run', rows).map((tile) => tile.key)).toEqual(['300', '1200', '3600'])
  })

  it('shows at most four tiles', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => row(key))
    expect(tileRows('run', rows)).toHaveLength(4)
  })

  it('has no tiles without records', () => {
    expect(tileRows('ride', [])).toEqual([])
  })
})
