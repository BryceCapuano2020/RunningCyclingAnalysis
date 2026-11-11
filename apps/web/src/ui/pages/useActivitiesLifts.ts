import { useMemo } from 'react'
import { liftDaysInBucket, liftDaysInPeriod, liftDaysOf } from '../activitiesLift'
import type { LiftRow } from '../activitiesLift'
import type { ActivitiesView } from '../activitiesView'
import { useLiveLiftSets } from '../lift/useLiveLiftSets'
import type { LiftSummaryAccount } from '../lift/useLiveLiftSets'

const NO_LIFT_ROWS: readonly LiftRow[] = []

/** Whether a view lists the lifting days: every kind or lifting alone, and not narrowed to activities not counted. */
export function listsLifts(view: Pick<ActivitiesView, 'sport' | 'show'>): boolean {
  return view.show === 'all' && (view.sport === 'all' || view.sport === 'lift')
}

export interface ActivitiesLifts {
  /** Every lifting day of the live sets, whatever the view. */
  all: readonly LiftRow[]
  /** The days in the view's period, which the strip draws: none while the view leaves lifting out. */
  inPeriod: readonly LiftRow[]
  /** Of those, the days in the picked week or month, which the list shows as rows. */
  listed: readonly LiftRow[]
}

/**
 * The lifting days of the Activities page, read from the same live sets as the Lift page, narrowed as its activities
 * are: to the period, which ends on the newest activity's day, and to the picked week or month.
 */
export function useActivitiesLifts(
  account: LiftSummaryAccount,
  view: Pick<ActivitiesView, 'sport' | 'show' | 'bucket'>,
  days: number | null,
  newestMs: number,
): ActivitiesLifts {
  const liveSets = useLiveLiftSets(account)
  const all = useMemo(() => liftDaysOf(liveSets ?? []), [liveSets])
  const listed = listsLifts(view)
  const inPeriod = useMemo(
    () => (listed ? liftDaysInPeriod(all, days, newestMs) : NO_LIFT_ROWS),
    [all, days, newestMs, listed],
  )
  const inBucket = useMemo(() => liftDaysInBucket(inPeriod, view.bucket), [inPeriod, view.bucket])
  return { all, inPeriod, listed: inBucket }
}
