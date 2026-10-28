import { describe, expect, it } from 'vitest'
import { measureTime } from './test/zoneTimeFixtures'
import { barSummary, periodTables } from './zoneTimeRows'

const now = measureTime('run', 'heartRate', [3600, 21_600, 7200, 3600, 0], {
  enteredReferences: [190],
})
const before = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0], {
  enteredReferences: [190],
})

describe('barSummary', () => {
  it('reads each zone that held time with its share', () => {
    expect(barSummary(now)).toBe('zone 1 10%, zone 2 60%, zone 3 20%, zone 4 10%')
  })
})

describe('periodTables', () => {
  it('has no previous column without a period before', () => {
    expect(periodTables([now]).table.columns).toEqual(['Measure', 'Zone', 'Name', 'Time', 'Share'])
  })

  it("adds the previous period's share of each zone, headed by its label", () => {
    const { table } = periodTables([now], [before], 'Previous 6 weeks')
    expect(table.columns.at(-1)).toBe('Previous 6 weeks')
    expect(table.rows.map((row) => row.at(-1))).toEqual(['20%', '40%', '30%', '10%', '0%'])
  })

  it('shows a dash where a measure cannot be compared, and keeps the column for the others', () => {
    const power = measureTime('ride', 'power', [3600, 3600, 3600, 3600, 3600, 3600, 3600], {
      enteredReferences: [250],
    })
    const { table } = periodTables([now, power], [before], 'Previous 6 weeks')
    expect(
      table.rows.filter((row) => row[0] === 'Measured power').every((row) => row.at(-1) === '—'),
    ).toBe(true)
    expect(table.rows.filter((row) => row[0] === 'Heart rate')[0]!.at(-1)).toBe('20%')
  })

  it('leaves the column out when the zones changed, so a shift in shares is not read as the athlete', () => {
    const moved = measureTime('run', 'heartRate', [7200, 14_400, 10_800, 3600, 0], {
      enteredReferences: [200],
    })
    expect(periodTables([now], [moved], 'Previous 6 weeks').table.columns).not.toContain(
      'Previous 6 weeks',
    )
  })

  it('leaves the column out when there is no label for the period before, as the lede does', () => {
    expect(periodTables([now], [before], null).table.columns).toEqual([
      'Measure',
      'Zone',
      'Name',
      'Time',
      'Share',
    ])
  })

  it('counts a heart rate set aside among what a measure left out', () => {
    const row = measureTime('run', 'heartRate', [1, 1, 1, 1, 1], {
      setAside: 2,
      noData: 1,
      noZones: 3,
    })
    expect(periodTables([row]).summary.rows[0]![3]).toBe('6')
  })
})
