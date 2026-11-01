import { describe, expect, it } from 'vitest'
import { METRES_PER_MILE } from '@rca/core/units'
import { callOf } from './charts/changeFixtures'
import { recordChange } from './recordChange'

/** A flat speed, m/s, for a pace in seconds per mile. */
const speedForMileSeconds = (seconds: number) => METRES_PER_MILE / seconds
const higher = callOf(1200, 'higher')
const lower = callOf(1200, 'lower')
const none = callOf(1200, 'none')
const untested = callOf(1200, 'untested')

describe('recordChange', () => {
  it('says a run is faster than the previous period by how much, in the pace unit, when the test calls it', () => {
    const now = speedForMileSeconds(402) // 6:42 /mi
    const before = speedForMileSeconds(414) // 6:54 /mi
    expect(recordChange('run', now, before, 'imperial', 'Previous 6 weeks', higher)).toBe(
      '0:12 /mi faster than previous 6 weeks',
    )
  })

  it('names a window further back by its months, as they are', () => {
    const now = speedForMileSeconds(402)
    const before = speedForMileSeconds(414)
    expect(recordChange('run', now, before, 'imperial', 'Jan to Mar', higher)).toBe(
      '0:12 /mi faster than Jan to Mar',
    )
    expect(recordChange('run', now, before, 'imperial', 'Jan to Mar', none)).toBe(
      'No clear change from Jan to Mar',
    )
  })

  it('says a run is slower when its pace has fallen back', () => {
    const now = speedForMileSeconds(414)
    const before = speedForMileSeconds(402)
    expect(recordChange('run', now, before, 'imperial', 'Previous year', lower)).toBe(
      '0:12 /mi slower than previous year',
    )
  })

  it('reads a run pace in kilometres when the units are metric', () => {
    const now = 1000 / 240 // 4:00 /km
    const before = 1000 / 250 // 4:10 /km
    expect(recordChange('run', now, before, 'metric', 'Previous 6 weeks', higher)).toBe(
      '0:10 /km faster than previous 6 weeks',
    )
  })

  it('says no clear change when the test does not call it, however far apart the paces look', () => {
    expect(
      recordChange(
        'run',
        speedForMileSeconds(380),
        speedForMileSeconds(414),
        'imperial',
        'Previous 6 weeks',
        none,
      ),
    ).toBe('No clear change from previous 6 weeks')
    expect(recordChange('ride', 300, 250, 'metric', 'Previous 6 weeks', none)).toBe(
      'No clear change from previous 6 weeks',
    )
  })

  it('says nothing for a length the test could not judge, or with no call at all', () => {
    expect(recordChange('ride', 300, 250, 'metric', 'Previous 6 weeks', untested)).toBeNull()
    expect(recordChange('run', 4, 3.5, 'metric', 'Previous 6 weeks', untested)).toBeNull()
    expect(recordChange('run', 4, 3.5, 'metric', 'Previous 6 weeks', undefined)).toBeNull()
  })

  it('compares paces as the page shows them, so two paces that both show 6:42 are no clear change', () => {
    expect(
      recordChange(
        'run',
        speedForMileSeconds(402.4),
        speedForMileSeconds(401.6),
        'imperial',
        'Previous 6 weeks',
        higher,
      ),
    ).toBe('No clear change from previous 6 weeks')
  })

  it('says a ride is more or less by how many watts, with no pace unit', () => {
    expect(recordChange('ride', 258, 250, 'metric', 'Previous 6 weeks', higher)).toBe(
      '8 W more than previous 6 weeks',
    )
    expect(recordChange('ride', 240, 250, 'metric', 'Previous 6 weeks', lower)).toBe(
      '10 W less than previous 6 weeks',
    )
  })

  it('groups the watts from a thousand on', () => {
    expect(recordChange('ride', 2234, 1000, 'metric', 'Previous 6 weeks', higher)).toBe(
      '1,234 W more than previous 6 weeks',
    )
  })

  it('gives nothing when the earlier period has no figure for the record', () => {
    expect(recordChange('ride', 250, Number.NaN, 'metric', 'Previous 6 weeks', higher)).toBeNull()
    expect(recordChange('run', Number.NaN, 4, 'metric', 'Previous 6 weeks', higher)).toBeNull()
  })

  describe('where the shown watts move the other way from the call', () => {
    // The same rider at a lower weight: power per kilogram is higher, though the watts are the same or fewer.
    it('says it in power per kilogram, from the call’s own ratio, not in watts', () => {
      const lighter = { ...higher, observed: Math.log(1.06) }
      expect(recordChange('ride', 245, 250, 'metric', 'Previous 6 weeks', lighter)).toBe(
        '6% more power per kilogram than previous 6 weeks',
      )
      expect(recordChange('ride', 250, 250, 'metric', 'Previous 6 weeks', lighter)).toBe(
        '6% more power per kilogram than previous 6 weeks',
      )
    })

    it('says it for a lower best too, when the watts rose but the rider is heavier', () => {
      const heavier = { ...lower, observed: Math.log(0.93) }
      expect(recordChange('ride', 255, 250, 'metric', 'Previous 6 weeks', heavier)).toBe(
        '7% less power per kilogram than previous 6 weeks',
      )
    })
  })
})
