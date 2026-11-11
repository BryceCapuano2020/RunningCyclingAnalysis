import { readFileSync } from 'node:fs'
import {
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_LIFT_SETS_PER_USER,
} from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_LIMIT_CASE, SMALLER_LIBRARIES } from './memoryCases.ts'

describe('the memory measurement covers the account limits', () => {
  it('measures the largest account the quotas admit, and nothing in the curve is above it', () => {
    expect(ACCOUNT_LIMIT_CASE).toEqual({
      activities: MAX_ACTIVITIES_PER_USER,
      digestBytes: MAX_DIGEST_BYTES_PER_USER,
      liftSets: MAX_LIFT_SETS_PER_USER,
    })
    expect(Math.max(...SMALLER_LIBRARIES)).toBeLessThan(MAX_ACTIVITIES_PER_USER)
  })

  it('is what the sim runs, and the lift cap is the one the database holds', () => {
    const sim = readFileSync(new URL('./memory.sim.test.ts', import.meta.url), 'utf8')
    expect(sim).toContain('ACCOUNT_LIMIT_CASE')
    const migration = readFileSync(
      new URL('../../migrations/0012_lift_sets.sql', import.meta.url),
      'utf8',
    )
    expect(migration).toContain(`BETWEEN 0 AND ${MAX_LIFT_SETS_PER_USER}`)
  })
})
