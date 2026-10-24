import { useEffect, useRef } from 'react'
import type { ImportOutcome } from '../worker/protocol'
import type { Route } from './route'
import { hrefFor } from './route'

/** Pages that show no import result, so an import made there is shown on Balance. */
const PAGES_WITHOUT_RESULTS: ReadonlySet<Route['page']> = new Set(['profile', 'method'])

/**
 * After an import submitted on Profile or Method, replaces the page with Balance, where its result is,
 * once the import has its outcome. The page is taken at each submission, so an earlier import that is
 * still running does not decide where a later one started. A visitor who has gone to another page by
 * then stays where they are.
 */
export function useBalanceAfterImport(
  outcome: ImportOutcome | null,
  page: Route['page'],
  submitted: number,
): void {
  const pageRef = useRef(page)
  // The page the latest submitted import started on; null once it has been taken to Balance.
  const origin = useRef<Route['page'] | null>(null)
  const lastSubmitted = useRef(submitted)
  const lastOutcome = useRef(outcome)

  useEffect(() => {
    pageRef.current = page
  })
  useEffect(() => {
    if (submitted === lastSubmitted.current) return
    lastSubmitted.current = submitted
    origin.current = pageRef.current
  }, [submitted])
  useEffect(() => {
    if (outcome === lastOutcome.current) return
    lastOutcome.current = outcome
    // Only an arriving outcome ends the import, so a clear or a new import does not take its place.
    if (outcome === null) return
    const from = origin.current
    origin.current = null
    if (from !== null && from === pageRef.current && PAGES_WITHOUT_RESULTS.has(from)) {
      window.location.replace(hrefFor({ page: 'balance' }))
    }
  }, [outcome])
}
