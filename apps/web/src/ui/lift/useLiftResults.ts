import { useMemo } from 'react'
import { liftResultsOf } from '@rca/core/lift'
import type { LiftResults } from '@rca/core/lift'
import { localDateOf } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/athlete'
import { createLiftTransport } from '../../api/lifts'
import type { LiftTransport } from '../../worker/liftTransport'
import { useNow } from '../useNow'
import { useLiveLiftSets } from './useLiveLiftSets'
import type { LiftSummaryAccount } from './useLiveLiftSets'

export type { LiftSummaryAccount } from './useLiveLiftSets'

/**
 * The lift results the pages show (docs/design/server-authority.md, L3), from core's `liftResultsOf`, the one function that works out
 * a lift figure. Signed in they are the server's, read from the snapshot (`accountLift`, null until it answers): the sets this device
 * has logged and not sent change nothing until they are saved. Signed out they are core's over this browser's own log. The log is still
 * read signed in, since that read syncs the sets to the account once, as it opens. `results` is null until there are some to show.
 */
export function useLiftResults(
  account: LiftSummaryAccount,
  settings: AthleteSettings,
  transportFor: (userId: string) => LiftTransport = createLiftTransport,
): LiftResults | null {
  const sets = useLiveLiftSets(account, transportFor)
  const today = localDateOf(useNow())
  return useMemo(() => {
    if (account.status === 'signed-in') return account.accountLift ?? null
    return sets === null ? null : liftResultsOf(sets, settings, today)
  }, [account.status, account.accountLift, sets, settings, today])
}
