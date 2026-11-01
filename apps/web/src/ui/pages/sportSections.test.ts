import { describe, expect, it } from 'vitest'
import { SPORT_ORDER } from '../sports'
import { SPORT_ROWS, SPORT_SECTIONS } from './sportSections'

describe('SPORT_SECTIONS', () => {
  it('puts the years first, a closed row that says its finding, then the open sections before the other closed ones', () => {
    for (const sport of SPORT_ORDER) {
      const sections = SPORT_SECTIONS[sport]
      expect(sections.slice(-4)).toEqual(['sameHeartRate', 'lateInEffort', 'standOut', 'evidence'])
      expect(sections.slice(0, 2)).toEqual(['years', 'bestEfforts'])
      for (const open of ['timeInZones', 'bestsOverTime'] as const) {
        expect(sections.indexOf(open)).toBeLessThan(sections.indexOf('sameHeartRate'))
      }
    }
  })

  it('pairs a run’s race predictions with its zones, and gives a ride its zones alone', () => {
    expect(SPORT_ROWS.run).toContainEqual(['racePredictions', 'timeInZones'])
    expect(SPORT_SECTIONS.ride).not.toContain('racePredictions')
    expect(SPORT_ROWS.ride).toContainEqual(['timeInZones'])
  })

  it('lists no section twice for a sport', () => {
    for (const sport of SPORT_ORDER) {
      expect(new Set(SPORT_SECTIONS[sport]).size).toBe(SPORT_SECTIONS[sport].length)
    }
  })

  it('never puts more than two sections in a row', () => {
    for (const sport of SPORT_ORDER) {
      for (const row of SPORT_ROWS[sport]) expect(row.length).toBeLessThanOrEqual(2)
    }
  })
})
