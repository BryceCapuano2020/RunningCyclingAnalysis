import type { WorkerRequest } from '../../worker/protocol'
import { isDeletion } from './model'
import type { Pending } from './model'

/**
 * The requests that do not hold the page busy. Reading the library kept in this browser is quick and
 * queued before anything else, so the sample and imports stay available while it loads. A period pick
 * only changes what is shown, so Stop and Share keep their state while the worker answers it. The age
 * grades' trend is requested on load, not by the visitor, so it does not hold the page busy either.
 */
export function isQuietRequest(kind: Pending['kind']): boolean {
  return (
    isDeletion(kind) ||
    kind === 'exportData' ||
    kind === 'activitySplits' ||
    kind === 'activityTrace' ||
    kind === 'loadDevice' ||
    kind === 'keepProvisional' ||
    kind === 'routeShape' ||
    kind === 'forgetRoutes' ||
    kind === 'setRange'
  )
}

/**
 * The requests that leave the last error standing as they are sent. Library loads run when a worker
 * starts, including after a crash, so they keep the message that says why; a download or a read of a
 * single activity does not touch the import or library error either.
 */
export function keepsError(request: WorkerRequest): boolean {
  return (
    request.type === 'loadServer' ||
    request.type === 'loadDevice' ||
    request.type === 'keepProvisional' ||
    request.type === 'exportData' ||
    request.type === 'activitySplits' ||
    request.type === 'activityTrace' ||
    request.type === 'routeShape' ||
    request.type === 'forgetRoutes'
  )
}
