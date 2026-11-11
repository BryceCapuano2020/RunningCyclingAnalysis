import {
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_LIFT_SETS_PER_USER,
} from '@rca/contract'

/**
 * The state job's memory is measured for the largest account the quotas admit: every account computes on the server, so
 * there is no smaller library the browser takes instead. `memory.sim.test.ts` runs this case, and `memoryCases.test.ts`
 * pins that it equals the account limits.
 */
export const ACCOUNT_LIMIT_CASE = {
  activities: MAX_ACTIVITIES_PER_USER,
  digestBytes: MAX_DIGEST_BYTES_PER_USER,
  liftSets: MAX_LIFT_SETS_PER_USER,
} as const

/** Smaller libraries, for the curve: activities as the fixture makes them, no padding, no lift sets. */
export const SMALLER_LIBRARIES = [1000, 2000, 3000] as const
