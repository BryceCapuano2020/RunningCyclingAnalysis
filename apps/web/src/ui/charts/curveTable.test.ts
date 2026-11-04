import { describe, expect, it, vi } from 'vitest'
import type { View } from './curveTable'

// The W/kg a ride row prints is the display module's, not a division written here: the spy returns a marker no division would.
const MARKER = 77.7
vi.mock('@rca/core/display', async (original) => ({
  ...(await original<typeof import('@rca/core/display')>()),
  wattsPerKg: vi.fn(() => MARKER),
}))

const { wkgOf } = await import('./curveTable')
const { wattsPerKg } = await import('@rca/core/display')

const view: View = {
  sport: 'ride',
  units: 'metric',
  massKg: 70,
  masses: { a: 80 },
  previous: null,
  change: null,
  names: undefined,
  shared: null,
}

describe('wkgOf', () => {
  it('asks the display module for the W/kg, at the mass on the day of the activity when it is dated', () => {
    expect(wkgOf({ durationS: 1200, value: 280, previous: NaN, activityId: 'a' }, view)).toBe(
      MARKER,
    )
    expect(wattsPerKg).toHaveBeenLastCalledWith(280, 80)
    wkgOf({ durationS: 1200, value: 280, previous: NaN, activityId: 'b' }, view)
    expect(wattsPerKg).toHaveBeenLastCalledWith(280, 70)
  })
})
