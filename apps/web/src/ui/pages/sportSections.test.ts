import { describe, expect, it } from 'vitest'
import { SPORT_ORDER } from '../sports'
import { SPORT_SECTIONS } from './sportSections'

describe('SPORT_SECTIONS', () => {
  it('lists late in long sessions once for each sport, as its last section', () => {
    for (const sport of SPORT_ORDER) {
      const sections = SPORT_SECTIONS[sport]
      expect(sections.filter((id) => id === 'lateInEffort')).toHaveLength(1)
      expect(sections.at(-1)).toBe('lateInEffort')
    }
  })

  it('reads a run’s sections in order, and a ride’s without the race predictions', () => {
    expect(SPORT_SECTIONS.run).toEqual([
      'bestEfforts',
      'racePredictions',
      'weekByWeek',
      'sameHeartRate',
      'lateInEffort',
    ])
    expect(SPORT_SECTIONS.ride).toEqual([
      'bestEfforts',
      'weekByWeek',
      'sameHeartRate',
      'lateInEffort',
    ])
  })

  it('lists no section twice for a sport', () => {
    for (const sport of SPORT_ORDER) {
      expect(new Set(SPORT_SECTIONS[sport]).size).toBe(SPORT_SECTIONS[sport].length)
    }
  })
})
