import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RouteShape } from '@rca/core/route/routeShape'
import type { RouteReply } from './routeReply'

/**
 * What the activity page shows for a route: nothing, the outline, or an offer to read the kept file.
 * `fromRequest` is true when the visitor asked for the outline, so it can take focus once drawn.
 */
export type RouteView =
  | { kind: 'none' }
  | { kind: 'shape'; route: RouteShape; fromRequest: boolean }
  | { kind: 'offer'; status: 'ready' | 'reading' | 'failed' | 'empty' }

const NONE: RouteView = { kind: 'none' }

/** The view for a free read: a route held here is drawn; one only in the kept file is offered. */
function firstView(reply: RouteReply): RouteView {
  if (reply.kind === 'shape') return { kind: 'shape', route: reply.route, fromRequest: false }
  return reply.kind === 'original' ? { kind: 'offer', status: 'ready' } : NONE
}

/** The view for a request that read the kept file, as the visitor asked. */
function askedView(reply: RouteReply): RouteView {
  if (reply.kind === 'shape') return { kind: 'shape', route: reply.route, fromRequest: true }
  return { kind: 'offer', status: reply.kind === 'failed' ? 'failed' : 'empty' }
}

/**
 * The route of a saved activity. The first read never touches the kept original file, so opening an
 * activity costs no download. `show` reads the file, and only when the visitor asks. A reply is
 * shown only for the activity still on screen: not one for another activity, and not one that
 * arrives after the page has gone.
 */
export function useRouteShape(
  routeId: string | null,
  loadRoute: (id: string, fromOriginal: boolean) => Promise<RouteReply>,
): { view: RouteView; show: () => void } {
  const [loaded, setLoaded] = useState<{ id: string; view: RouteView } | null>(null)
  const shownIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    shownIdRef.current = routeId
    return () => {
      shownIdRef.current = null
    }
  }, [routeId])

  const settle = useCallback((id: string, view: RouteView) => {
    if (shownIdRef.current === id) setLoaded({ id, view })
  }, [])

  useEffect(() => {
    if (routeId === null) return
    const fail = () => settle(routeId, NONE)
    loadRoute(routeId, false).then((reply) => settle(routeId, firstView(reply)), fail)
  }, [routeId, loadRoute, settle])

  const show = useCallback(() => {
    if (routeId === null) return
    setLoaded({ id: routeId, view: { kind: 'offer', status: 'reading' } })
    const fail = () => settle(routeId, askedView({ kind: 'failed' }))
    loadRoute(routeId, true).then((reply) => settle(routeId, askedView(reply)), fail)
  }, [routeId, loadRoute, settle])

  return { view: loaded !== null && loaded.id === routeId ? loaded.view : NONE, show }
}
