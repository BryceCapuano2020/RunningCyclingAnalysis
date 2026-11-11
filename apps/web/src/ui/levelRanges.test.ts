import { describe, expect, it } from 'vitest'
import type { LevelBand } from '@rca/core/grade'
import { levelFigureHead, levelRangeRows } from './levelRanges'

/** Synthetic bands, top to bottom: open at the top, closed in the middle, open at the bottom. */
const BANDS: LevelBand[] = [
  { label: 'World', best: null, worst: 4800 },
  { label: 'National', best: 4801, worst: 5400 },
  { label: 'Recreational', best: 9001, worst: null },
]

describe('levelRangeRows', () => {
  it('writes a run as half marathon times, fastest first, with the pace under each', () => {
    const rows = levelRangeRows('run', BANDS, 'metric', 'National')
    expect(levelFigureHead('run')).toBe('Half marathon')
    expect(rows.map((row) => row.range)).toEqual([
      '1:20:00 or faster',
      '1:20:01 to 1:30:00',
      '2:30:01 or slower',
    ])
    // 4800 s over 21.0975 km is 3:48 a kilometre.
    expect(rows[0]!.pace).toBe('3:48 /km or faster')
    expect(rows[1]!.pace).toBe('3:48 to 4:16 /km')
    expect(levelRangeRows('run', BANDS, 'imperial', null)[0]!.pace).toBe('6:06 /mi or faster')
  })

  it('writes a ride as watts rising with the level, and names no pace', () => {
    const rows = levelRangeRows(
      'ride',
      [
        { label: 'World', best: null, worst: 320 },
        { label: 'National', best: 319, worst: 280 },
        { label: 'Recreational', best: 149, worst: null },
      ],
      'metric',
      null,
    )
    expect(rows.map((row) => row.range)).toEqual(['320 W and up', '280 to 319 W', 'Up to 149 W'])
    expect(rows.every((row) => row.pace === null)).toBe(true)
  })

  it('writes a big three total in the athlete’s unit', () => {
    const bands: LevelBand[] = [
      { label: 'World', best: null, worst: 453.59237 },
      { label: 'National', best: 453.13877763, worst: 226.796185 },
    ]
    expect(levelRangeRows('lift', bands, 'imperial', null).map((row) => row.range)).toEqual([
      '1000 lb and up',
      '500 to 999 lb',
    ])
    expect(levelRangeRows('lift', bands, 'metric', null)[0]!.range).toBe('453.59 kg and up')
  })

  it('marks the athlete’s level only, and gives each level its grade band and meaning', () => {
    const rows = levelRangeRows('run', BANDS, 'metric', 'National')
    expect(rows.map((row) => row.mine)).toEqual([false, true, false])
    expect(rows.map((row) => row.band)).toEqual(['90% and up', '80% to 89%', 'Under 30%'])
    expect(rows[1]!.meaning).toBe('You contend at a national championship.')
    expect(levelRangeRows('lift', BANDS, 'metric', null)[1]!.meaning).toBe(
      'You place at a national meet.',
    )
  })
})
