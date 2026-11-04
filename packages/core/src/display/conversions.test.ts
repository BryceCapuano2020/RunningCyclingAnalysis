import { describe, expect, it } from 'vitest'
import { PRIORS } from '../constants'
import { DURATION_TABLES } from '../threshold/durationTables'
import { SPORTS } from '../types'
import {
  DISPLAY_ECONOMY,
  flatSpeedOfWkg,
  nativeOfWkg,
  ridePowerAt,
  ridePowerOfWkg,
  runWkgOfTrace,
  shortestEffortMin,
  wattsPerKg,
  wkgOfFlatSpeed,
  wkgOfRidePower,
} from './conversions'

describe('the display conversions', () => {
  it('read a run at the prior centre, so a threshold and the anchor share a scale', () => {
    expect(DISPLAY_ECONOMY).toBe(PRIORS.runEconomyScale.mean)
  })

  it('turn a speed to W/kg and back', () => {
    for (const speed of [2.5, 3.4, 5]) {
      expect(flatSpeedOfWkg(wkgOfFlatSpeed(speed))).toBeCloseTo(speed, 12)
    }
  })

  it('turn watts to W/kg and back, and say the per-kg figure', () => {
    expect(wkgOfRidePower(ridePowerOfWkg(14, 70), 70)).toBeCloseTo(14, 12)
    const figure = ridePowerAt(14, 80)
    expect(figure.watts).toBe(ridePowerOfWkg(14, 80))
    expect(figure.wattsPerKg).toBe(wattsPerKg(figure.watts, 80))
  })

  it('give a sport its own number', () => {
    expect(nativeOfWkg('run', 14, 70)).toBe(flatSpeedOfWkg(14))
    expect(nativeOfWkg('ride', 14, 70)).toBe(ridePowerOfWkg(14, 70))
  })

  it('price a run trace at the display scale', () => {
    const speed = Float64Array.from([3, 3, 3])
    const flat = runWkgOfTrace(speed, new Float64Array(3))
    expect(flatSpeedOfWkg(flat[1]!)).toBeCloseTo(3, 9)
  })

  it('name the shortest effort of each sport from its duration table', () => {
    for (const sport of SPORTS) {
      expect(shortestEffortMin(sport)).toBe(DURATION_TABLES[sport].shortestS / 60)
    }
  })
})
