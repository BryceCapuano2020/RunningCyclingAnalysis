// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePagination } from './usePagination'

afterEach(() => {
  cleanup()
})

function numbers(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

describe('usePagination', () => {
  it('shows the first page and counts the pages', () => {
    const { result } = renderHook(() => usePagination(numbers(25), 20))
    expect(result.current.page).toBe(0)
    expect(result.current.pageCount).toBe(2)
    expect(result.current.visible).toHaveLength(20)
  })

  it('has one empty page for an empty list', () => {
    const { result } = renderHook(() => usePagination(numbers(0), 20))
    expect(result.current.pageCount).toBe(1)
    expect(result.current.visible).toEqual([])
  })

  it('moves to the requested page', () => {
    const { result } = renderHook(() => usePagination(numbers(25), 20))
    act(() => result.current.changePage(1))
    expect(result.current.page).toBe(1)
    expect(result.current.visible).toEqual([20, 21, 22, 23, 24])
  })

  it('stores the clamped page so a list that grows back does not jump to the old page', () => {
    const { result, rerender } = renderHook(({ count }) => usePagination(numbers(count), 20), {
      initialProps: { count: 21 },
    })
    act(() => result.current.changePage(1))

    rerender({ count: 20 })
    expect(result.current.page).toBe(0)
    rerender({ count: 21 })
    expect(result.current.page).toBe(0)
    expect(result.current.visible).toHaveLength(20)
  })

  it('keeps the page when the items change', () => {
    const { result, rerender } = renderHook(({ count }) => usePagination(numbers(count), 20), {
      initialProps: { count: 45 },
    })
    act(() => result.current.changePage(2))

    rerender({ count: 44 })
    expect(result.current.page).toBe(2)
    expect(result.current.visible).toHaveLength(4)
  })

  it('starts again on the first page when the reset key changes', () => {
    const { result, rerender } = renderHook(
      ({ count, key }) => usePagination(numbers(count), 20, key),
      { initialProps: { count: 45, key: 1 } },
    )
    act(() => result.current.changePage(2))

    rerender({ count: 25, key: 2 })
    expect(result.current.page).toBe(0)
    expect(result.current.visible).toHaveLength(20)
  })

  it('moves focus to the first item of the page it moves to', () => {
    const first = document.createElement('li')
    first.tabIndex = -1
    document.body.append(first)
    const { result } = renderHook(() => usePagination<number, HTMLLIElement>(numbers(25), 20))
    result.current.firstItemRef.current = first

    act(() => result.current.changePage(1))
    expect(document.activeElement).toBe(first)
    first.remove()
  })
})
