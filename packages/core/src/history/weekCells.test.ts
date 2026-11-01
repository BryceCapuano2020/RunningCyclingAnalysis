import { describe, expect, it } from 'vitest'
import { cellAt, cellCount, MAX_CELL_ACTIVITIES, MAX_CELL_TENTHS, packCell } from './weekCells'

describe('a week of one sport as three characters', () => {
  it('is "AAA" for a week of rest and reads back the hours to a tenth and the count', () => {
    expect(packCell(0, 0)).toBe('AAA')
    expect(cellAt(packCell(7.34, 4), 0)).toEqual({ hours: 7.3, activities: 4 })
    expect(cellAt(packCell(0, 0), 0)).toEqual({ hours: 0, activities: 0 })
  })

  it('keeps a tenth of an hour for a week with a short activity, so it is not read as rest', () => {
    expect(cellAt(packCell(0.01, 1), 0)).toEqual({ hours: 0.1, activities: 1 })
    // Hours without an activity are not a week of training.
    expect(cellAt(packCell(3, 0), 0)).toEqual({ hours: 0, activities: 0 })
  })

  it('holds a figure past its range at the end of it', () => {
    expect(cellAt(packCell(900, 100), 0)).toEqual({
      hours: MAX_CELL_TENTHS / 10,
      activities: MAX_CELL_ACTIVITIES,
    })
    expect(cellAt(packCell(-2, -1), 0)).toEqual({ hours: 0, activities: 0 })
  })

  it('round-trips a sweep of hours and every count, in three characters each', () => {
    let wrong = 0
    for (let tenths = 1; tenths <= MAX_CELL_TENTHS; tenths += 13) {
      for (let count = 1; count <= MAX_CELL_ACTIVITIES; count++) {
        const cell = packCell(tenths / 10, count)
        const back = cellAt(cell, 0)
        if (cell.length !== 3 || back.hours !== tenths / 10 || back.activities !== count) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('reads cell after cell of a run, and zeros past the end of it', () => {
    const run = packCell(1, 1) + packCell(2.5, 3) + packCell(0, 0)
    expect(cellCount(run)).toBe(3)
    expect(cellAt(run, 1)).toEqual({ hours: 2.5, activities: 3 })
    expect(cellAt(run, 5)).toEqual({ hours: 0, activities: 0 })
    expect(cellCount('')).toBe(0)
  })
})
