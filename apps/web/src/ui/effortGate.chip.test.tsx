// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortCheck } from '@rca/core/types'
import { effortCaveat } from './effortCaveat'

afterEach(cleanup)

describe('the caveat when the reference cannot show an effort was hard', () => {
  const check = (reference: EffortCheck['runReference'], share = 0.98): EffortCheck => ({
    durationS: HEADLINE_DURATION_S,
    runHrFraction: share,
    rideHrFraction: null,
    runReference: reference,
    rideReference: null,
  })

  it('says the effort was not checked where too few days have a heart rate', () => {
    expect(effortCaveat(check('thin'))?.short).toBe(
      'Too few days with heart rate, so the effort was not checked.',
    )
  })

  it('gives the share card a line that heart rate does not show the efforts were hard', () => {
    expect(effortCaveat(check('low'))?.short).toBe(
      'Heart rate does not show the best efforts over 20 min were hard.',
    )
    expect(effortCaveat(check('trusted'))).toBeNull()
  })
})
