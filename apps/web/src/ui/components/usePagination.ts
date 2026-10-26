import { useEffect, useRef, useState } from 'react'
import { startsOnScreen } from './onScreen'

/** Activity lists, saved and imported, show this many rows to a page. */
export const PAGE_SIZE = 20

export interface PaginationOptions {
  /** The page to start on, counted from zero, such as one the address names. */
  initialPage?: number
  /** Told each page the list moves to, so a page can keep it in its address. */
  onPageChange?: (page: number) => void
}

/**
 * Pages a list. The page is clamped to the pages that exist and stored that way, so a list that
 * shrinks and grows again does not jump back. A new resetKey, such as a new collection of
 * activities, starts again on the first page. After a move, focus stays on the control that asked
 * for it while that control can still be pressed; otherwise it goes to the first item shown, which
 * is the element firstItemRef is attached to.
 */
export function usePagination<T, E extends HTMLElement>(
  items: readonly T[],
  pageSize: number,
  resetKey?: unknown,
  options: PaginationOptions = {},
) {
  const [state, setState] = useState({ key: resetKey, page: options.initialPage ?? 0 })
  const firstItemRef = useRef<E>(null)
  const moveRef = useRef<{ page: number; control: HTMLElement | null } | null>(null)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const requested = state.key === resetKey ? state.page : 0
  const page = Math.min(requested, pageCount - 1)
  if (state.key !== resetKey || state.page !== page) setState({ key: resetKey, page })

  useEffect(() => {
    const move = moveRef.current
    if (move === null || move.page !== page) return
    moveRef.current = null
    const control = move.control
    // The list has been scrolled to its top, so a control now below the screen is not focused, since
    // focus would scroll the page back down to it. Focus goes to the first row, which is on screen.
    const onScreen = control !== null && startsOnScreen(control.getBoundingClientRect().top)
    if (control?.isConnected && !control.hasAttribute('disabled') && onScreen) {
      control.focus({ preventScroll: true })
    } else {
      firstItemRef.current?.focus({ preventScroll: true })
    }
  }, [page])

  function changePage(nextPage: number, control: HTMLElement | null = null) {
    moveRef.current = { page: nextPage, control }
    setState({ key: resetKey, page: nextPage })
    options.onPageChange?.(nextPage)
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
