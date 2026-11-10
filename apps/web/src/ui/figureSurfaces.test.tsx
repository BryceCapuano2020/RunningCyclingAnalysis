// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PRIORS } from '@rca/core/constants'
import { thresholdRunSpeed } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { formatPace, formatPower } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import {
  MAN_BORN_1986,
  flatWkg,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from './components/test/fixtures'
import { threshold } from './records'
import { standingOf } from './standing'
import { thresholdLine } from './thresholdLine'

afterEach(cleanup)

/*
 * A figure shown in two places is one number (docs/ENGINEERING.md, "One figure, one function"). Each test renders the surfaces that
 * state a threshold from one result and compares what they print, so a second path to the figure fails here.
 */

const MASS_KG = 75
const UNITS: readonly UnitSystem[] = ['metric', 'imperial']

function resultWith(runMs: number, rideW: number): AnalysisResult {
  const rideThreshold = makeRideThreshold(rideW / (PRIORS.grossEfficiency.mean * MASS_KG))
  return makeResult({
    runThreshold: makeRunThreshold(flatWkg(runMs)),
    rideThreshold,
    rideThresholdRunSpeed: thresholdRunSpeed(rideThreshold, 'male'),
  })
}

/** A ride that grades under the run, and a run that grades under the ride: the lower sport has a "to match it". */
const RIDE_LOWER = resultWith(4, 120)
const RUN_LOWER = resultWith(2.6, 330)

describe.each(UNITS)('a ride threshold in %s units', (units) => {
  const context = { massKg: MASS_KG, units }
  const standing = standingOf(RIDE_LOWER, MAN_BORN_1986, context)

  it('prints the same watts on the tile and the curve line', () => {
    expect(standing.match.ride).not.toBeNull()
    const printed = threshold(RIDE_LOWER, 'ride', MASS_KG, units)!.value
    const line = thresholdLine(RIDE_LOWER, 'ride', MASS_KG, units)!
    expect(formatPower(line.value)).toBe(printed)
  })
})

describe.each(UNITS)('a run threshold in %s units', (units) => {
  const context = { massKg: MASS_KG, units }
  const standing = standingOf(RUN_LOWER, MAN_BORN_1986, context)

  it('prints the same pace on the tile and the curve line', () => {
    expect(standing.match.run).not.toBeNull()
    const printed = threshold(RUN_LOWER, 'run', MASS_KG, units)!.value
    const line = thresholdLine(RUN_LOWER, 'run', MASS_KG, units)!
    expect(formatPace(line.value, units)).toBe(printed)
  })
})
