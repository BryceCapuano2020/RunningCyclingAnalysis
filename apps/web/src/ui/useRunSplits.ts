import { useEffect, useState } from 'react'
import type { DigestSplits } from '@rca/core/types'
import type { SplitsLoad } from './components/splitRows'

/**
 * A run's splits, asked for from the worker once the activity page shows it. The page keeps the answer,
 * so the best efforts can word their timing note by it. A null id asks for nothing and stays loading.
 */
export function useRunSplits(
  activityId: string | null,
  loadSplits: (id: string) => Promise<DigestSplits | null>,
): SplitsLoad {
  const [answer, setAnswer] = useState<{ id: string; load: SplitsLoad } | null>(null)
  useEffect(() => {
    if (activityId === null) return
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
  return answer?.id === activityId ? answer.load : { status: 'loading' }
}
