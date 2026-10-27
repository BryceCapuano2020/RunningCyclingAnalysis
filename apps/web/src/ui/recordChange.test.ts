import { describe, expect, it } from 'vitest'
import { METRES_PER_MILE } from '@rca/core/units'
import { recordChange } from './recordChange'

/** A flat speed, m/s, for a pace in seconds per mile. */
const speedForMileSeconds = (seconds: number) => METRES_PER_MILE / seconds

describe('recordChange', () => {
  it('says a run is faster than the previous period by how much, in the pace unit', () => {
    const now = speedForMileSeconds(402) // 6:42 /mi
    const before = speedForMileSeconds(414) // 6:54 /mi
    expect(recordChange('run', now, before, 'imperial', 'Previous 6 weeks')).toBe(
      '0:12 /mi faster than previous 6 weeks',
    )
  })

  it('says a run is slower when its pace has fallen back', () => {
    const now = speedForMileSeconds(414)
    const before = speedForMileSeconds(402)
    expect(recordChange('run', now, before, 'imperial', 'Previous year')).toBe(
      '0:12 /mi slower than previous year',
    )
  })

  it('reads a run pace in kilometres when the units are metric', () => {
    const now = 1000 / 240 // 4:00 /km
    const before = 1000 / 250 // 4:10 /km
    expect(recordChange('run', now, before, 'metric', 'Previous 6 weeks')).toBe(
      '0:10 /km faster than previous 6 weeks',
    )
  })

  it('compares paces as the page shows them, so two paces that both show 6:42 are the same', () => {
    expect(
      recordChange(
        'run',
        speedForMileSeconds(402.4),
        speedForMileSeconds(401.6),
        'imperial',
        'Previous 6 weeks',
      ),
    ).toBe('Same as previous 6 weeks')
  })

  it('shows a one-second change when the paces show as 6:43 and 6:42', () => {
    // 402.6 s shows as 6:43 and 402.2 s as 6:42, so the current pace is one second slower.
    expect(
      recordChange(
        'run',
        speedForMileSeconds(402.6),
        speedForMileSeconds(402.2),
        'imperial',
        'Previous 6 weeks',
      ),
    ).toBe('0:01 /mi slower than previous 6 weeks')
  })

  it('says a ride is more or less by how many watts, with no pace unit', () => {
    expect(recordChange('ride', 258, 250, 'metric', 'Previous 6 weeks')).toBe(
      '8 W more than previous 6 weeks',
    )
    expect(recordChange('ride', 240, 250, 'metric', 'Previous 6 weeks')).toBe(
      '10 W less than previous 6 weeks',
    )
  })

  it('groups the watts from a thousand on', () => {
    expect(recordChange('ride', 2234, 1000, 'metric', 'Previous 6 weeks')).toBe(
      '1,234 W more than previous 6 weeks',
    )
  })

  it('says the same when the displayed figure has not moved', () => {
    expect(recordChange('ride', 250.2, 250, 'metric', 'Previous 6 weeks')).toBe(
      'Same as previous 6 weeks',
    )
    expect(
      recordChange(
        'run',
        speedForMileSeconds(402),
        speedForMileSeconds(402.3),
        'imperial',
        'Previous 6 weeks',
      ),
    ).toBe('Same as previous 6 weeks')
  })

  it('gives nothing when the earlier period has no figure for the record', () => {
    expect(recordChange('ride', 250, Number.NaN, 'metric', 'Previous 6 weeks')).toBeNull()
    expect(recordChange('run', Number.NaN, 4, 'metric', 'Previous 6 weeks')).toBeNull()
  })
})
