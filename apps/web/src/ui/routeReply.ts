import type { RouteShape } from '@rca/core/route/routeShape'
import type { WorkerResponse } from '../worker/protocol'

/**
 * What the page learns about an activity's route. `original` means the route is in the kept original
 * file, which is read only when the visitor asks for it.
 */
export type RouteReply =
  | { kind: 'shape'; route: RouteShape }
  | { kind: 'original' }
  | { kind: 'none' }
  | { kind: 'failed' }

/** The reply a route request gets, as the page reads it. A reply that never came is a failure. */
export function replyOf(message: WorkerResponse | null): RouteReply {
  if (message?.type !== 'routeShape') return { kind: 'failed' }
  if (message.route !== null) return { kind: 'shape', route: message.route }
  return { kind: message.original ? 'original' : 'none' }
}
