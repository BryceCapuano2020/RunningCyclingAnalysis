import { useEffect, useRef } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../../worker/protocol'

/**
 * Tells the worker whether to grade the headline trend: once the athlete has an age and sex, and
 * again when they stop being known. The worker starts without grading, and only an age-graded
 * Balance trend uses the running equivalents that grading computes. A new worker, after a sign-in,
 * Stop, a crash or an account switch, starts without it too, so it is told again when it starts.
 */
export function useGradeTrendRequest(
  gradeTrend: boolean,
  settings: { readonly current: AthleteSettings },
  send: (request: WorkerRequest) => void,
  workerGeneration: number,
): void {
  const grading = useRef(false)
  // What the worker was told is forgotten with the worker. This cleanup also runs when React
  // re-runs the effects in development, which creates the worker afresh.
  useEffect(
    () => () => {
      grading.current = false
    },
    [workerGeneration],
  )
  useEffect(() => {
    if (grading.current === gradeTrend) return
    grading.current = gradeTrend
    send({ type: 'setGradeTrend', on: gradeTrend, settings: settings.current })
  }, [gradeTrend, settings, send, workerGeneration])
}
