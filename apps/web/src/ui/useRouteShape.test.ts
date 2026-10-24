// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { RouteShape } from '@rca/core/route/routeShape'
import { describe, expect, it, vi } from 'vitest'
import type { RouteReply } from './routeReply'
import { useRouteShape } from './useRouteShape'

const SHAPE: RouteShape = {
  points: [
    [0, 0],
    [1, 1],
  ],
  aspect: 1,
}
const ORIGINAL: RouteReply = { kind: 'original' }

/** A read the test settles by hand, as a download does when it finishes. */
function deferred() {
  let settle: (reply: RouteReply) => void = () => undefined
  const promise = new Promise<RouteReply>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

describe('useRouteShape', () => {
  it('draws a route held here at once, from the first read', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'shape', route: SHAPE }))
    const { result } = renderHook(() => useRouteShape('A', loadRoute))

    await vi.waitFor(() =>
      expect(result.current.view).toMatchObject({ kind: 'shape', route: SHAPE }),
    )
    expect(loadRoute).toHaveBeenCalledWith('A', false)
  })

  it('shows no view when the first read finds no route at all', async () => {
    const loadRoute = vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' }))
    const { result } = renderHook(() => useRouteShape('A', loadRoute))

    await act(async () => undefined)

    expect(result.current.view).toEqual({ kind: 'none' })
  })

  it('marks a route read from the kept file as drawn by the request, so that it can take focus', async () => {
    const reads = deferred()
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean) =>
      fromOriginal ? reads.promise : Promise.resolve(ORIGINAL),
    )
    const { result } = renderHook(() => useRouteShape('A', loadRoute))
    await vi.waitFor(() => expect(result.current.view).toEqual({ kind: 'offer', status: 'ready' }))

    act(() => result.current.show())
    await act(async () => reads.settle({ kind: 'shape', route: SHAPE }))

    expect(result.current.view).toEqual({ kind: 'shape', route: SHAPE, fromRequest: true })
  })

  it('does not show a read of the kept file for the activity the page has left', async () => {
    const reads = deferred()
    const loadRoute = vi.fn((_id: string, fromOriginal: boolean) =>
      fromOriginal ? reads.promise : Promise.resolve(ORIGINAL),
    )
    const { result, rerender } = renderHook(({ id }) => useRouteShape(id, loadRoute), {
      initialProps: { id: 'A' },
    })
    await vi.waitFor(() => expect(result.current.view).toEqual({ kind: 'offer', status: 'ready' }))
    act(() => result.current.show())

    rerender({ id: 'B' })
    await vi.waitFor(() => expect(loadRoute).toHaveBeenCalledWith('B', false))
    await vi.waitFor(() => expect(result.current.view).toEqual({ kind: 'offer', status: 'ready' }))
    await act(async () => reads.settle({ kind: 'shape', route: SHAPE }))

    expect(result.current.view).toEqual({ kind: 'offer', status: 'ready' })
  })
})
