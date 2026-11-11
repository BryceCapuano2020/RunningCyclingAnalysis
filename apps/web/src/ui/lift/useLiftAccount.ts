import { useMemo } from 'react'
import type { LiftResults } from '@rca/core/lift'
import type { AccountController } from '../useAccount'
import type { LiftSummaryAccount } from './useLiveLiftSets'

/**
 * Who the lift reads are for, with the lift results the server's snapshot carries when signed in: the lifting corner on Balance reads
 * the sets the Lift page logs, from the same scope, and an account's figures from the snapshot.
 */
export function useLiftAccount(
  account: Pick<AccountController, 'status' | 'me'>,
  accountLift: LiftResults | null,
): LiftSummaryAccount {
  const userId = account.me?.user.id ?? null
  return useMemo(
    () => ({ status: account.status, userId, accountLift }),
    [account.status, userId, accountLift],
  )
}
