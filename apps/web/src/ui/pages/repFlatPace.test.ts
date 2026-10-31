import { describe, expect, it } from 'vitest'
import { PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { descentCost, metabolicToFlatSpeed, runCost } from '@rca/core/metabolic'
import { flatSpeedOf } from './repFlatPace'
import { repsTrace } from './workbenchFixtures'

const SCALE = PRIORS.runEconomyScale.mean
const SPEED = 3

/** A run at 3 m/s down a steady grade of `percent` (negative), the fixture's distance being 3 m a second. */
function descent(percent: number) {
  return repsTrace('run', [{ seconds: 600, speed: SPEED, climb: (percent / 100) * SPEED }])
}

/** The flat speed a steady `cost` at 3 m/s reads back as. */
function flatOf(cost: number): number {
  return metabolicToFlatSpeed(RESTING_W_PER_KG + SCALE * cost * SPEED, SCALE)
}

describe('flatSpeedOf follows the digest’s descent cost', () => {
  it('credits a steep descent with descentCost, which saves less than runCost does', () => {
    const flat = flatSpeedOf(descent(-10), 100, 500)!
    expect(flat).toBeCloseTo(flatOf(descentCost(-0.1)), 2)
    expect(flat).toBeGreaterThan(flatOf(runCost(-0.1)) + 0.05)
  })

  it('reads a gentle descent and a climb as before: descentCost is runCost from -4% up', () => {
    expect(flatSpeedOf(descent(-3), 100, 500)!).toBeCloseTo(flatOf(runCost(-0.03)), 2)
    expect(flatSpeedOf(descent(5), 100, 500)!).toBeCloseTo(flatOf(runCost(0.05)), 2)
  })
})
