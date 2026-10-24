import { useEffect, useRef } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../../worker/protocol'

/**
 * Tells the worker whether to grade the headline trend: once the athlete has an age and sex, and
 * again when they stop being known. The worker starts without grading, and only an age-graded
 * Balance trend uses the running equivalents that grading computes.
 */
export function useGradeTrendRequest(
  gradeTrend: boolean,
  settings: { readonly current: AthleteSettings },
  send: (request: WorkerRequest) => void,
): void {
  const grading = useRef(false)
  useEffect(() => {
    if (grading.current === gradeTrend) return
    grading.current = gradeTrend
    send({ type: 'setGradeTrend', on: gradeTrend, settings: settings.current })
  }, [gradeTrend, settings, send])
}
