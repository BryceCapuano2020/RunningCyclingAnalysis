import { isDeletion } from './model'
import type { Pending } from './model'

/**
 * The requests that do not hold the page busy. Reading the library kept in this browser is quick and
 * queued before anything else, so the sample and imports stay available while it loads. A period pick
 * only changes what is shown, so Stop and Share keep their state while the worker answers it.
 */
export function isQuietRequest(kind: Pending['kind']): boolean {
  return (
    isDeletion(kind) ||
    kind === 'exportData' ||
    kind === 'activitySplits' ||
    kind === 'loadDevice' ||
    kind === 'routeShape' ||
    kind === 'forgetRoutes' ||
    kind === 'setRange'
  )
}
