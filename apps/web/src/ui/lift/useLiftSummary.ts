import { useMemo } from 'react'
import { buildLiftState } from '@rca/core/lift'
import type { LiftState } from '@rca/core/lift'
import type { AthleteSettings } from '@rca/core/athlete'
import { createLiftTransport } from '../../api/lifts'
import type { LiftTransport } from '../../worker/liftTransport'
import { useLiveLiftSets } from './useLiveLiftSets'
import type { LiftSummaryAccount } from './useLiveLiftSets'

export type { LiftSummaryAccount } from './useLiveLiftSets'

const NONE: LiftState = { revision: 0, lifts: [], weeks: [] }

/**
 * The lift estimates of this browser's scope, for pages that show them (the Balance hero): core's `buildLiftState` over
 * the live sets `useLiveLiftSets` reads, which says how it syncs and when it reads again. `ready` is false until the
 * first read answers.
 */
export function useLiftSummary(
  account: LiftSummaryAccount,
  settings: AthleteSettings,
  transportFor: (userId: string) => LiftTransport = createLiftTransport,
) {
  const sets = useLiveLiftSets(account, transportFor)
  const state = useMemo(
    () => (sets === null ? NONE : buildLiftState(sets, settings)),
    [sets, settings],
  )
  return { lifts: state.lifts, ready: sets !== null }
}
