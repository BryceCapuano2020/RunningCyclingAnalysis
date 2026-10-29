import { describe, expect, it } from 'vitest'
import { idleFrom, lastIndexWhere } from './idleReadout'

describe('idleFrom', () => {
  it('says the latest reading in one line, leaving out a row with no value', () => {
    expect(
      idleFrom({
        x: 0,
        y: 0,
        title: 'Week ending 25 Oct',
        rows: [
          { label: 'Run', value: '64%' },
          { label: 'Ride, estimated', value: '—' },
        ],
      }),
    ).toBe('Latest · Week ending 25 Oct: Run 64%')
  })

  it('is undefined with no reading, or with no value in it, so the row falls back to its hint', () => {
    expect(idleFrom(null)).toBeUndefined()
    expect(
      idleFrom({ x: 0, y: 0, title: 'Week', rows: [{ label: 'Run', value: '—' }] }),
    ).toBeUndefined()
  })
})

describe('idleFrom with a lead', () => {
  it('leads with the word given, for a chart whose row at rest is its best and not its latest', () => {
    expect(
      idleFrom(
        { x: 0, y: 0, title: '20 min', rows: [{ label: 'Pace', value: '6:37 /mi' }] },
        'Best',
      ),
    ).toBe('Best · 20 min: Pace 6:37 /mi')
  })
})

describe('lastIndexWhere', () => {
  it('finds the last row that holds, and -1 when none does', () => {
    expect(lastIndexWhere([1, 0, 2, 0], (n) => n > 0)).toBe(2)
    expect(lastIndexWhere([0, 0], (n) => n > 0)).toBe(-1)
  })
})
