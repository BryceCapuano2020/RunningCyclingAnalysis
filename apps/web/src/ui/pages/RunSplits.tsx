import { useEffect, useState } from 'react'
import type { DigestSplits } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SplitsTable, type SplitsLoad } from '../components/SplitsTable'

export interface RunSplitsProps {
  activityId: string
  units: UnitSystem
  distanceM: number
  loadSplits: (id: string) => Promise<DigestSplits | null>
}

/** A run's splits, asked for from the worker when the activity page shows it. */
export function RunSplits({ activityId, units, distanceM, loadSplits }: RunSplitsProps) {
  const [answer, setAnswer] = useState<{ id: string; load: SplitsLoad } | null>(null)
  useEffect(() => {
    // A reply for an activity the page has left is dropped.
    let current = true
    loadSplits(activityId).then(
      (splits) => {
        if (current) setAnswer({ id: activityId, load: { status: 'loaded', splits } })
      },
      () => {
        if (current) setAnswer({ id: activityId, load: { status: 'failed' } })
      },
    )
    return () => {
      current = false
    }
  }, [activityId, loadSplits])
  const load: SplitsLoad = answer?.id === activityId ? answer.load : { status: 'loading' }
  return <SplitsTable load={load} units={units} distanceM={distanceM} />
}
