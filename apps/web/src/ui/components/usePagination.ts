import { useEffect, useRef, useState } from 'react'

/** Activity lists, saved and imported, show this many rows to a page. */
export const PAGE_SIZE = 20

/**
 * Pages a list. The page is clamped to the pages that exist and stored that way, so a list that
 * shrinks and grows again does not jump back. A new resetKey, such as a new collection of
 * activities, starts again on the first page. Moving pages moves focus to the first item shown,
 * which is the element firstItemRef is attached to.
 */
export function usePagination<T, E extends HTMLElement>(
  items: readonly T[],
  pageSize: number,
  resetKey?: unknown,
) {
  const [state, setState] = useState({ key: resetKey, page: 0 })
  const firstItemRef = useRef<E>(null)
  const focusPageRef = useRef<number | null>(null)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const requested = state.key === resetKey ? state.page : 0
  const page = Math.min(requested, pageCount - 1)
  if (state.key !== resetKey || state.page !== page) setState({ key: resetKey, page })

  useEffect(() => {
    if (focusPageRef.current !== page) return
    firstItemRef.current?.focus()
    focusPageRef.current = null
  }, [page])

  function changePage(nextPage: number) {
    focusPageRef.current = nextPage
    setState({ key: resetKey, page: nextPage })
  }

  const firstIndex = page * pageSize
  return {
    page,
    pageCount,
    visible: items.slice(firstIndex, firstIndex + pageSize),
    firstItemRef,
    changePage,
  }
}
