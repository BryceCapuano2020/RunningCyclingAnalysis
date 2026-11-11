import { useEffect, useRef, useState } from 'react'
import type { Route } from './route'
import { hrefFor } from './route'

/**
 * Removing all activities clears the analysis in the worker. The landing page shows once the old
 * result is gone, so it never flashes on the way. Leaving Profile first cancels the move; it
 * replaces the Profile history entry rather than adding one.
 */
export function useRemoveAll(clear: () => void, hasResult: boolean, page: Route['page']) {
  const removing = useRef(false)
  useEffect(() => {
    if (!removing.current) return
    if (page !== 'profile') removing.current = false
    else if (!hasResult) {
      removing.current = false
      window.location.replace(hrefFor({ page: 'balance' }))
    }
  }, [hasResult, page])
  return () => {
    // The runs counted at walking pace are forgotten when the worker reports the library forgotten (rememberKept).
    clear()
    // With no result on screen the effect above never runs, so the landing page is shown now.
    if (!hasResult) {
      window.location.replace(hrefFor({ page: 'balance' }))
      return
    }
    removing.current = true
  }
}

/** Whether the landing page should say the account was deleted; the note goes once the visitor moves to another page. */
export function useAccountDeleted(page: Route['page']) {
  const [deleted, setDeleted] = useState(false)
  const [notedPage, setNotedPage] = useState(page)
  if (notedPage !== page) {
    setNotedPage(page)
    if (page !== 'balance') setDeleted(false)
  }
  return [deleted, setDeleted] as const
}
