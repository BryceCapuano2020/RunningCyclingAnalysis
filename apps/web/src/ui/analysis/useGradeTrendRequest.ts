import { useEffect, useRef } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../../worker/protocol'

/** What the worker of one generation was last told; generation -1 is no worker. */
interface Told {
  generation: number
  on: boolean
}

const NO_WORKER: Told = { generation: -1, on: false }

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
  const told = useRef(NO_WORKER)
  // What the worker was told is forgotten with the worker. This cleanup also runs when React
  // re-runs the effects in development, which creates the worker afresh.
  useEffect(() => {
    const generation = workerGeneration
    return () => {
      if (told.current.generation === generation) told.current = NO_WORKER
    }
  }, [workerGeneration])
  useEffect(() => {
    const knows = told.current.generation === workerGeneration ? told.current.on : false
    told.current = { generation: workerGeneration, on: gradeTrend }
    if (knows !== gradeTrend)
      send({ type: 'setGradeTrend', on: gradeTrend, settings: settings.current })
  }, [gradeTrend, settings, send, workerGeneration])
}
